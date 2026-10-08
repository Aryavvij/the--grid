/* Grid fuel core: page registry, demo/login data switch, formatting, modal + toast helpers.
   Loaded before every other js/fuel/* file. No build step. Uses Grid's own header, modal and toast patterns. */
(function () {
  const G = (window.Grid = window.Grid || {});
  G.pages = {};

  G.isDemo = () => sessionStorage.getItem('gridMode') === 'demo';

  /** Register a page. def = { sub, dot?, tools?: html, render(root) }. Mounted into #page-<name>. */
  G.registerPage = (name, def) => { G.pages[name] = def; };

  // ── instant pages: last copy first, fresh copy in the background ──────
  // The older Grid pages draw from data kept in the browser and sync quietly;
  // these pages used to wait 2-3 s for the API on every visit. Every API answer
  // is now kept per account in IndexedDB (mirrored in memory so a page draws
  // in the same frame) and refreshed in the background. Dates in a request are
  // stored relative to today, so yesterday's copy still serves today's first paint.
  const who = () => sessionStorage.getItem('gridUser') || '';
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  const todayNoon = () => new Date(G.fmt.date(new Date()) + 'T12:00:00');
  const relParams = (params) => Object.fromEntries(Object.entries(params)
    .filter(([, v]) => v != null && v !== '').sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => [k, isoDay.test(v) ? '@' + Math.round((new Date(v + 'T12:00:00') - todayNoon()) / 86400000) : v]));
  const absParams = (rel) => Object.fromEntries(Object.entries(rel).map(([k, v]) => {
    if (!/^@-?\d+$/.test(v)) return [k, v];
    const d = todayNoon(); d.setDate(d.getDate() + Number(v.slice(1))); return [k, G.fmt.date(d)];
  }));
  const keyOf = (kind, params) => who() + '|' + kind + '|' + JSON.stringify(relParams(params));

  const cache = (() => {
    const mem = new Map();                       // key -> JSON string
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('grid-fuel-cache', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('kv', mode), req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req && req.result); t.onerror = t.onabort = () => rej(t.error);
    }));
    let ready = null;
    return {
      mem,
      /** Load this account's entries into memory once (a few ms). */
      ready() {
        if (!ready) ready = open().then(db => new Promise((res) => {
          const prefix = who() + '|';
          const t = db.transaction('kv', 'readonly');
          const req = t.objectStore('kv').openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
          req.onsuccess = () => {
            const c = req.result; if (!c) return;
            if (typeof c.value === 'string' && !mem.has(c.key)) mem.set(c.key, c.value);
            c.continue();
          };
          t.oncomplete = () => res(); t.onerror = t.onabort = () => res();
        })).catch(() => {});
        return ready;
      },
      get: (k) => mem.get(k),
      set(k, json) { mem.set(k, json); tx('readwrite', s => s.put(json, k)).catch(() => {}); },
      clear() { mem.clear(); ready = null; return tx('readwrite', s => s.clear()).catch(() => {}); },
    };
  })();

  /** Keep a value the page changed locally, so the next visit starts from it. */
  G.cacheSet = (kind, params, value) => { if (!G.isDemo() && who()) cache.set(keyOf(kind, params), JSON.stringify(value)); };
  /** Forget every cached answer (called on logout). */
  G.clearCache = () => cache.clear();

  /** Called from navigate(): header in Grid's page-header / page-subtitle style, then the page body.
      Draws at once from the last copy when there is one and refreshes in the background; the
      LOADING line only appears when nothing is cached and the server is slow.
      Never leaves the body blank: a failure shows what went wrong, and failed requests show a notice with RETRY. */
  G.show = (name) => {
    const def = G.pages[name], root = document.getElementById('page-' + name);
    if (!def || !root) return;
    const token = (G._showToken = (G._showToken || 0) + 1);            // a newer visit supersedes this one
    G.problems = []; G.stale = [];
    root.innerHTML = `
      <div class="page-header" style="margin-bottom:20px;align-items:center">
        <div><div class="page-subtitle" style="margin-top:0"><span class="dot" style="background:${def.dot || 'var(--green)'}"></span>${def.sub}</div></div>
        <div class="fx-tools" data-role="tools">${def.tools || ''}</div>
      </div>
      <div data-role="notice"></div>
      <div data-role="body"><div class="hl-empty fx-wait">LOADING…</div></div>
      ${def.foot ? `<div class="fx-foot">${def.foot}</div>` : ''}`;
    const body = root.querySelector('[data-role="body"]'), notice = root.querySelector('[data-role="notice"]');
    const showNotice = () => {
      if (token !== G._showToken) return;
      if (!G.problems.length && G.stale.length) {
        // The page is drawn from the last saved copy because the refresh failed.
        notice.innerHTML = `<div class="fin-section" style="border-color:rgba(249,115,22,.4);margin-bottom:16px"><div class="fin-section-title" style="color:var(--orange);margin-bottom:8px">SHOWING YOUR LAST SAVED COPY</div>
          <div class="hl-note" style="text-transform:none;line-height:1.8;font-size:10px">Could not reach the server to refresh ${[...new Set(G.stale.map(p => p.kind))].join(', ')}. <span style="color:var(--text-muted)">(${[...new Set(G.stale.map(p => p.message))].slice(0, 2).join(' · ').slice(0, 140)})</span></div>
          <div style="margin-top:10px"><button class="hl-btn pri" data-retry>RETRY</button></div></div>`;
        notice.querySelector('[data-retry]').onclick = () => G.show(name);
        return;
      }
      if (!G.problems.length) { notice.innerHTML = ''; return; }
      const auth = G.problems.some(p => p.status === 401);
      notice.innerHTML = `<div class="fin-section" style="border-color:rgba(249,115,22,.4);margin-bottom:16px"><div class="fin-section-title" style="color:var(--orange);margin-bottom:8px">${auth ? 'YOU MAY BE SIGNED OUT' : 'SOME DATA COULD NOT BE LOADED'}</div>
        <div class="hl-note" style="text-transform:none;line-height:1.8;font-size:10px">${auth ? 'The server said your session is not valid. Sign out and back in, then retry.' : 'The page is showing empty values for: ' + [...new Set(G.problems.map(p => p.kind))].join(', ') + '.'} <span style="color:var(--text-muted)">(${[...new Set(G.problems.map(p => p.message))].slice(0, 2).join(' · ').slice(0, 140)})</span></div>
        <div style="margin-top:10px"><button class="hl-btn pri" data-retry>RETRY</button></div></div>`;
      notice.querySelector('[data-retry]').onclick = () => G.show(name);
    };
    const failed = (e) => {
      console.warn('[fuel:' + name + ']', e);
      if (token !== G._showToken) return;
      body.innerHTML = `<div class="hl-empty">COULD NOT DRAW THIS PAGE<br><span style="text-transform:none">${String((e && e.message) || e).slice(0, 200)}</span><br><br><button class="hl-btn pri" data-retry>RETRY</button></div>`;
      body.querySelector('[data-retry]').onclick = () => G.show(name);
      showNotice();
    };
    // One draw "pass": G.data answers from the cache while it is set and queues fresh requests.
    const draw = (mode) => {
      const pass = (G._pass = { mode, token, queries: [], pending: [] });
      return Promise.resolve().then(() => def.render(body, root)).finally(() => { if (G._pass === pass) G._pass = null; }).then(() => pass);
    };
    const live = !G.isDemo() && who();
    (live ? cache.ready() : Promise.resolve()).then(() => draw('swr')).then((pass) => {
      showNotice();
      if (!live) return;
      cache.set(who() + '|queries|' + name, JSON.stringify(pass.queries));
      if (!pass.pending.length) return;
      // Once the user clicks or types here, don't redraw under them: the fresh copy is
      // already cached, and every save on these pages reloads from the server anyway.
      let touched = false;
      const mark = () => { touched = true; };
      root.addEventListener('pointerdown', mark, { capture: true, once: true });
      root.addEventListener('keydown', mark, { capture: true, once: true });
      Promise.all(pass.pending).then((changed) => {
        if (!G.stale.length && !G.problems.length) cache.set(who() + '|stamp|' + name, String(Date.now()));
        showNotice();
        const hidden = root.offsetParent === null;
        if (!changed.some(Boolean) || touched || hidden || token !== G._showToken || document.querySelector('.fx-modal')) return;
        draw('cached').catch(failed);
      });
    }).catch(failed);
  };

  /** Data access: demo mode reads seeded mock data, login mode calls the API (through the cache above). */
  const fetchFresh = async (kind, params) => {
    const map = { runs: '/api/runs', presets: '/api/nutrition/presets', foodlog: '/api/nutrition/log', targets: '/api/nutrition/targets', water: '/api/nutrition/water', burn: '/api/progress/burn' };
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    const timeout = new Promise((_, rej) => setTimeout(() => rej({ message: 'request timed out after 20s' }), 20000));
    const r = await Promise.race([gridFetch(map[kind] + (qs ? '?' + qs : ''), { cache: 'no-store' }), timeout]);
    // validate the shape so one odd response can never crash a page: lists must be arrays, targets an object or null
    if (kind === 'targets') { if (r == null || (typeof r === 'object' && !Array.isArray(r) && 'calories' in r)) return r || null; throw { message: 'unexpected response for targets' }; }
    if (!Array.isArray(r)) throw { message: 'unexpected response for ' + kind + ' (expected a list)' };
    return r;
  };
  const failedRequest = (kind, e) => {
    console.warn('[fuel] ' + kind + ' fetch failed:', e);
    (G.problems = G.problems || []).push({ kind, status: e && e.status, message: (e && e.message) || String(e) });
    return kind === 'targets' ? null : [];
  };

  G.data = async (kind, params = {}) => {
    if (G.isDemo()) return G.seed.get(kind, params);
    const key = who() ? keyOf(kind, params) : null, pass = G._pass;
    if (pass && key) {
      pass.queries.push([kind, relParams(params)]);
      const hit = cache.get(key);
      if (hit !== undefined) {
        if (pass.mode === 'swr') {
          pass.pending.push(fetchFresh(kind, params).then(
            (r) => { const json = JSON.stringify(r); cache.set(key, json); return json !== hit; },
            (e) => {
              // A failed refresh leaves the saved copy on screen. A 401 still means "signed out" though.
              if (e && e.status === 401) failedRequest(kind, e);
              else (G.stale = G.stale || []).push({ kind, message: (e && e.message) || String(e) });
              return false;
            }));
        }
        return JSON.parse(hit);
      }
    }
    try { const r = await fetchFresh(kind, params); if (key) cache.set(key, JSON.stringify(r)); return r; }
    catch (e) { return failedRequest(kind, e); }
  };

  // Pages never opened on this device yet still open instantly: after login, their
  // usual requests are fetched in the background. Once a page has been opened, the
  // requests it actually made are replayed instead (kept with the cache).
  const FIRST_VISIT = {
    runs:      [['runs', { limit: 5000 }]],
    nutrition: [['presets', {}], ['foodlog', { from: '@-34', to: '@0' }], ['water', { from: '@-34', to: '@0' }], ['targets', {}]],
  };
  G.prefetch = async () => {
    if (G.isDemo() || !who() || typeof gridFetch !== 'function') return;
    await cache.ready();
    const seen = new Set();
    for (const page of Object.keys(FIRST_VISIT)) {
      // Refreshed in the last 10 minutes (by a visit or an earlier warm-up)? Leave it, the API is rate limited.
      const stamp = Number(cache.get(who() + '|stamp|' + page)) || 0;
      if (Date.now() - stamp < 10 * 60 * 1000) continue;
      let qs = FIRST_VISIT[page];
      try { const rec = cache.get(who() + '|queries|' + page); if (rec) qs = JSON.parse(rec); } catch (e) {}
      await Promise.all(qs.map(([kind, rel]) => {
        const params = absParams(rel), key = keyOf(kind, params);
        if (seen.has(key)) return null; seen.add(key);
        return fetchFresh(kind, params).then(r => cache.set(key, JSON.stringify(r)), () => {});
      }));
      cache.set(who() + '|stamp|' + page, String(Date.now()));
    }
  };
  if (!G.isDemo() && who()) {
    cache.ready();
    window.addEventListener('load', () => setTimeout(() => G.prefetch(), 1200));
  }

  // ── formatting ───────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  G.fmt = {
    date: (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    num: (n, dp = 0) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })),
    hm: (min) => (min == null ? '—' : Math.floor(min / 60) + 'h ' + pad(Math.round(min % 60)) + 'm'),
    pace: (secPerKm) => (!secPerKm || !isFinite(secPerKm) ? '—' : Math.floor(secPerKm / 60) + ':' + pad(Math.round(secPerKm % 60)) + ' /km'),
    dur: (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60); return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s); },
    km: (m, dp = 1) => (m == null ? '—' : (m / 1000).toFixed(dp)),
    short: (iso) => { const d = new Date(iso + 'T00:00:00'); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); },
  };
  G.stats = {
    avg: (a) => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; },
    sum: (a) => a.reduce((s, x) => s + (x || 0), 0),
    sd: (a) => { const v = a.filter(x => x != null), m = G.stats.avg(v); return v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : 0; },
  };

  // ── toast: Grid's own for plain messages; an equivalent with UNDO when an action is needed ──
  G.toast = (msg, undoFn) => {
    const text = String(msg).replace(/<[^>]*>/g, '');
    if (!undoFn && typeof showAccessToast === 'function') return showAccessToast(text);
    document.querySelectorAll('.fx-toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'fx-toast'; t.textContent = text;
    if (undoFn) { const b = document.createElement('button'); b.textContent = 'UNDO'; b.onclick = () => { undoFn(); t.remove(); }; t.appendChild(b); }
    document.body.appendChild(t); setTimeout(() => t.remove(), 5000);
  };

  /** Download rows (array of arrays) as a CSV file. Cells starting with = + - @ are prefixed so spreadsheets never run them as formulas. */
  G.csv = (filename, rows) => {
    const cell = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const blob = new Blob([rows.map(r => r.map(cell).join(',')).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ── modal: Grid's .modal-overlay / .modal / .form-* / .btn-* ──
  G.field = (label, input) => `<div class="form-group"><label class="form-label">${label}</label>${input}</div>`;
  G.input = (name, v = '', extra = '') => `<input class="form-input" name="${name}" value="${String(v ?? '').replace(/"/g, '&quot;')}" ${extra}>`;
  G.select = (name, opts, v) => `<select class="form-select" name="${name}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  G.formData = (m) => Object.fromEntries([...m.querySelectorAll('[name]')].map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value.trim()]));
  /** Opens a modal; returns the overlay element. onMount(overlay, close). Footer buttons are the caller's (use .modal-actions). */
  G.modal = (title, bodyHtml, onMount, width = 520) => {
    document.querySelectorAll('.fx-modal').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'modal-overlay open fx-modal';
    m.innerHTML = `<div class="modal" style="width:${width}px;max-height:92vh;overflow:auto"><div class="modal-title">${title}</div>${bodyHtml}</div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    m.querySelectorAll('[data-cancel]').forEach(b => { b.onclick = close; });
    onMount(m, close); return m;
  };
})();
