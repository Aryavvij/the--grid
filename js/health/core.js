/* Grid health core: page registry, demo/auth data switch, formatting.
   Loaded before every other js/health/* file. No build step. */
(function () {
  const G = (window.Grid = window.Grid || {});
  G.pages = {};
  G.state = { range: 30 };

  G.isDemo = () => sessionStorage.getItem('gridMode') === 'demo';

  /** Register a page. def = { title, sub, render(root, ctx), ranges?: [7,30,90] } */
  G.registerPage = (name, def) => { G.pages[name] = def; };

  /** Called from navigate(). Mounts the page's header once, then renders its body. */
  G.show = (name) => {
    const def = G.pages[name];
    const root = document.getElementById('page-' + name);
    if (!def || !root) return;
    const demo = G.isDemo();
    const ranges = def.ranges;
    root.innerHTML = `
      <div class="hl-head">
        <div><div class="hl-title">${def.title}</div><div class="hl-sub">${def.sub || ''}</div></div>
        <div class="hl-tools">
          ${ranges ? `<div class="hl-pills" data-role="ranges">${ranges.map(r =>
            `<button class="hl-pill ${G.state.range === r ? 'on' : ''}" data-r="${r}">${r}D</button>`).join('')}</div>` : ''}
          ${!demo && def.google ? '<button class="hl-btn" data-role="sync">…</button>' : `<span class="hl-chip ${demo ? 'demo' : ''}"><span class="dot"></span>${demo ? 'DEMO DATA' : 'LIVE'}</span>`}
        </div>
      </div>
      <div data-role="body"></div>
      <div class="hl-foot">General guidance, not medical advice.</div>`;
    const body = root.querySelector('[data-role="body"]');
    const draw = async () => {
      try { await def.render(body, { range: G.state.range, demo }); }
      catch (e) { console.warn('[health:' + name + ']', e); body.innerHTML = '<div class="hl-empty">COULD NOT LOAD THIS PAGE<br>' + (e && e.message || '') + '</div>'; }
    };
    const syncBtn = root.querySelector('[data-role="sync"]');
    if (syncBtn) G.syncButton(syncBtn, draw);
    const pills = root.querySelector('[data-role="ranges"]');
    if (pills) pills.addEventListener('click', (e) => {
      const b = e.target.closest('.hl-pill'); if (!b) return;
      G.state.range = +b.dataset.r;
      pills.querySelectorAll('.hl-pill').forEach(p => p.classList.toggle('on', p === b));
      draw();
    });
    draw();
  };

  /** Data access: demo mode reads seeded mock data, auth mode calls the API. */
  G.data = async (kind, params = {}) => {
    if (G.isDemo()) return G.seed.get(kind, params);
    const map = {
      daily: '/api/health/daily', sleep: '/api/health/sleep', runs: '/api/runs',
      presets: '/api/nutrition/presets', foodlog: '/api/nutrition/log', targets: '/api/nutrition/targets', water: '/api/nutrition/water',
    };
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    try { return await gridFetch(map[kind] + (qs ? '?' + qs : '')); }
    catch (e) { console.warn('[health] ' + kind + ' fetch failed:', e); return kind === 'targets' ? null : []; }
  };

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
    lastN: (a, n) => a.slice(-n),
  };

  // ── Google Health connect / sync button ─────────────────────
  const ago = (iso) => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
  G.syncButton = async (btn, redraw) => {
    const paint = (st) => {
      btn.classList.toggle('pri', !st.connected || st.lastSyncStatus === 'reauth_required');
      if (!st.connected) btn.textContent = 'CONNECT GOOGLE HEALTH';
      else if (st.lastSyncStatus === 'reauth_required') btn.textContent = 'RECONNECT GOOGLE HEALTH';
      else btn.textContent = 'SYNC NOW · ' + (st.lastSyncStatus === 'partial' ? 'PARTIAL · ' : st.lastSyncStatus === 'error' ? 'ERROR · ' : '') + ago(st.lastSyncAt).toUpperCase();
      btn.title = st.lastSyncError || '';
      btn._st = st;
    };
    try { paint(await gridFetch('/api/health/status')); } catch (e) { btn.textContent = 'STATUS UNAVAILABLE'; return; }
    btn.onclick = async () => {
      const st = btn._st;
      try {
        if (!st.connected || st.lastSyncStatus === 'reauth_required') {
          const { url } = await gridFetch('/api/health/google/connect'); window.location.href = url; return;
        }
        btn.disabled = true; btn.textContent = 'SYNCING…';
        const r = await gridFetch('/api/health/sync', { method: 'POST', body: JSON.stringify({ days: 7 }) });
        G.toast(`SYNCED ${r.days} DAYS · ${r.sleepNights} NIGHTS` + (Object.keys(r.errors || {}).length ? ' · SOME METRICS FAILED' : ''));
      } catch (e) { G.toast((e.message || 'SYNC FAILED').toUpperCase()); }
      btn.disabled = false;
      try { paint(await gridFetch('/api/health/status')); } catch (_) {}
      redraw();
    };
  };

  // Returning from Google's consent screen: ?health=connected|denied|error
  document.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search).get('health'); if (!q) return;
    const msg = { connected: 'GOOGLE HEALTH CONNECTED. FIRST SYNC RUNNING, REFRESH IN A MINUTE', denied: 'GOOGLE ACCESS WAS NOT GRANTED', no_refresh_token: 'GOOGLE DID NOT RETURN A REFRESH TOKEN. TRY AGAIN', error: 'COULD NOT CONNECT GOOGLE HEALTH' }[q];
    if (msg) setTimeout(() => G.toast(msg), 800);
    history.replaceState(null, '', location.pathname);
  });

  G.toast = (html, undoFn) => {
    document.querySelectorAll('.hl-toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'hl-toast'; t.innerHTML = html;
    if (undoFn) { const b = document.createElement('button'); b.textContent = 'UNDO'; b.onclick = () => { undoFn(); t.remove(); }; t.appendChild(b); }
    document.body.appendChild(t); setTimeout(() => t.remove(), 5000);
  };
})();
