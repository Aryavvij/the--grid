/* Grid fuel core: page registry, demo/login data switch, formatting, modal + toast helpers.
   Loaded before every other js/fuel/* file. No build step. Uses Grid's own header, modal and toast patterns. */
(function () {
  const G = (window.Grid = window.Grid || {});
  G.pages = {};

  G.isDemo = () => sessionStorage.getItem('gridMode') === 'demo';

  /** Register a page. def = { sub, dot?, tools?: html, render(root) }. Mounted into #page-<name>. */
  G.registerPage = (name, def) => { G.pages[name] = def; };

  /** Called from navigate(): header in Grid's page-header / page-subtitle style, then the page body. */
  G.show = (name) => {
    const def = G.pages[name], root = document.getElementById('page-' + name);
    if (!def || !root) return;
    root.innerHTML = `
      <div class="page-header" style="margin-bottom:20px;align-items:center">
        <div><div class="page-subtitle" style="margin-top:0"><span class="dot" style="background:${def.dot || 'var(--green)'}"></span>${def.sub}</div></div>
        <div class="fx-tools" data-role="tools">${def.tools || ''}</div>
      </div>
      <div data-role="body"></div>
      ${def.foot ? `<div class="fx-foot">${def.foot}</div>` : ''}`;
    const body = root.querySelector('[data-role="body"]');
    Promise.resolve().then(() => def.render(body, root)).catch((e) => { console.warn('[fuel:' + name + ']', e); body.innerHTML = '<div class="hl-empty">COULD NOT LOAD THIS PAGE<br>' + (e && e.message || '') + '</div>'; });
  };

  /** Data access: demo mode reads seeded mock data, login mode calls the API. */
  G.data = async (kind, params = {}) => {
    if (G.isDemo()) return G.seed.get(kind, params);
    const map = { runs: '/api/runs', presets: '/api/nutrition/presets', foodlog: '/api/nutrition/log', targets: '/api/nutrition/targets', water: '/api/nutrition/water',
      weight: '/api/progress/weight', photos: '/api/progress/photos', burn: '/api/progress/burn' };
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    try { return await gridFetch(map[kind] + (qs ? '?' + qs : '')); }
    catch (e) { console.warn('[fuel] ' + kind + ' fetch failed:', e); return kind === 'targets' ? null : []; }
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
