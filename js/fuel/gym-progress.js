/* Gym PROGRESS tab: injected into the existing gym page without touching its code.
   Reads the same localStorage.gymLogs / gymExerciseRegistry the logger writes. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats, M = () => G.gym;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PALETTE = ['#76b372', '#3b82f6', '#f97316', '#9b59b6', '#14b8a6', '#ef4444', '#ff4d8f', '#eab308', '#94d68f', '#60a5fa'];
  const st = { name: null, range: 180, weeks: 8 };

  const readLogs = () => { try { const v = JSON.parse(localStorage.getItem('gymLogs') || '[]'); return Array.isArray(v) ? v.filter(l => l && typeof l === 'object') : []; } catch (e) { return []; } };
  const muscleMap = () => {
    const map = {};
    try { const reg = JSON.parse(localStorage.getItem('gymExerciseRegistry') || '{}'); Object.entries(reg).forEach(([mg, v]) => ((v && v.exercises) || []).forEach(e => { map[String(e.name).trim().toUpperCase()] = mg.toUpperCase(); })); } catch (e) { /* no registry: everything is OTHER */ }
    return (name) => map[name] || null;
  };

  function inject() {
    const nav = document.querySelector('#page-workout .gym-subnav'), page = document.getElementById('page-workout');
    if (!nav || !page || document.getElementById('gym-progress')) return;
    const tab = document.createElement('div'); tab.className = 'gym-tab'; tab.textContent = 'PROGRESS'; tab.setAttribute('onclick', "gymTab(this,'progress')"); nav.appendChild(tab);
    const panel = document.createElement('div'); panel.id = 'gym-progress'; panel.style.cssText = 'display:none;padding:24px 28px'; page.appendChild(panel);
    const orig = window.gymTab;
    window.gymTab = function (el, tabName) {
      const p = document.getElementById('gym-progress');
      if (tabName === 'progress') {
        document.querySelectorAll('.gym-tab').forEach(t => t.classList.remove('active')); el.classList.add('active');
        ['gym-split', 'gym-muscle', 'gym-registry', 'gym-log'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        p.style.display = 'block'; render(p);
      } else { if (p) p.style.display = 'none'; orig.apply(this, arguments); }
    };
  }

  async function render(root) {
    const logs = readLogs(), today = F.date(new Date()), muscleOf = muscleMap();
    const valid = logs.filter(l => M().validDate(l.date));
    if (!valid.length) { root.innerHTML = G.empty('NO WORKOUTS LOGGED YET<br>Log a session on the WEEKLY SPLIT tab and your progress shows up here.'); return; }
    const names = M().exerciseNames(valid); if (!st.name || !names.includes(st.name)) st.name = names[0];
    const ids = {}; ['prog', 'wk', 'cal'].forEach(k => { ids[k] = G.uid(); });
    const inRange = (from, to) => valid.filter(l => l.date >= from && l.date <= to);
    const d30 = M().addDays(today, -29), d60 = M().addDays(today, -59), cur = inRange(d30, today), prev = inRange(d60, M().addDays(today, -30));
    const vol = (ls) => Math.round(S.sum(ls.map(M().sessionVolume))), sets = (ls) => S.sum(ls.map(M().sessionSets));
    const prsRecent = names.reduce((n, nm) => n + M().withPRs(M().history(valid, nm)).filter(p => p.pr && p.date >= d30).length, 0);
    const plateaus = names.filter(nm => M().plateau(M().history(valid, nm), today));
    const board = M().prBoard(valid);
    const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

    root.innerHTML = `
      <div class="page-header" style="margin-bottom:20px"><div><div class="page-subtitle" style="margin-top:0"><span class="dot" style="background:var(--green)"></span>Strength trends · PRs · weekly volume · training calendar</div></div></div>
      <div class="hl-grid hl-g4" id="gt"></div>
      <div class="hl-grid hl-g21">
        ${G.card('EXERCISE PROGRESSION', `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
            <select id="exSel" style="font:inherit;font-size:11px;color:var(--text);background:var(--carbon-1);border:1px solid var(--carbon-4);border-radius:6px;padding:7px 10px">${names.map(n => `<option ${n === st.name ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            <div class="hl-pills">${[[90, '90D'], [180, '6M'], [365, '1Y'], [9999, 'ALL']].map(([d, l]) => `<button class="hl-pill ${st.range === d ? 'on' : ''}" data-rng="${d}">${l}</button>`).join('')}</div><span id="exChip"></span></div>
          <div class="hl-chart" id="${ids.prog}"></div>`, '<span class="hl-note">LINE = ESTIMATED 1RM · DOTS = TOP SET WEIGHT · NEON = NEW PR</span>')}
        ${G.card('RECENT SESSIONS', '<div id="exTbl"></div>')}
      </div>
      <div class="hl-grid hl-g21">
        ${G.card('WEEKLY SETS BY MUSCLE', `<div class="hl-chart" id="${ids.wk}"></div>`, '<span class="hl-note">GUIDE: 10-20 HARD SETS PER MUSCLE PER WEEK</span>')}
        ${G.card('THIS WEEK VS GUIDE', '<div id="wkTbl"></div>')}
      </div>
      ${G.card('PERSONAL RECORDS', '<div id="prTbl"></div>', '<span class="hl-note">BEST ESTIMATED 1RM PER LIFT (EPLEY)</span>')}
      ${G.card('TRAINING CALENDAR', `<div class="hl-chart sm" id="${ids.cal}"></div>`, '<span class="hl-note">COLOUR = SESSION VOLUME</span>')}`;

    G.tiles(root.querySelector('#gt'), [
      { label: 'SESSIONS · 30D', value: cur.length, delta: pct(cur.length, prev.length), goodWhen: 'up', vs: 'vs prev 30d' },
      { label: 'VOLUME · 30D', value: F.num(vol(cur)), unit: 'kg', delta: pct(vol(cur), vol(prev)), goodWhen: 'up', vs: 'vs prev 30d' },
      { label: 'HARD SETS · 30D', value: sets(cur), delta: pct(sets(cur), sets(prev)), goodWhen: 'up', vs: 'vs prev 30d' },
      { label: 'NEW PRS · 30D', value: prsRecent, note: plateaus.length ? `${plateaus.length} LIFT${plateaus.length > 1 ? 'S' : ''} PLATEAUED (4+ WEEKS)` : 'NO PLATEAUS' }]);

    drawExercise(root, ids, valid, today);
    drawWeekly(root, ids, valid, muscleOf, today);
    root.querySelector('#prTbl').innerHTML = board.length ? `<table class="hl-table"><tr><th>Lift</th><th>Best e1RM</th><th>Set</th><th>Date</th><th>Previous</th><th>Sessions</th></tr>${board.slice(0, 15).map(b => {
      const fresh = b.date >= M().addDays(today, -14) && b.prevE1rm;
      return `<tr style="cursor:pointer" data-ex="${esc(b.name)}"><td>${esc(b.name)}${fresh ? ' <span class="hl-code" style="color:var(--sig-900);border-color:var(--sig-900)">NEW PR</span>' : ''}</td><td>${b.e1rm} kg</td><td>${b.weight} × ${b.reps}</td><td>${b.date}</td><td>${b.prevE1rm ? b.prevE1rm + ' kg (+' + (b.e1rm - b.prevE1rm).toFixed(1) + ')' : '—'}</td><td>${b.sessions}</td></tr>`; }).join('')}</table>` : G.empty('NO RECORDS YET');
    root.querySelectorAll('[data-ex]').forEach(tr => tr.onclick = () => { st.name = tr.dataset.ex; render(root); root.scrollIntoView(); });
    const days = {}; valid.forEach(l => { days[l.date] = (days[l.date] || 0) + M().sessionVolume(l); });
    G.heat(ids.cal, { range: [M().addDays(today, -181), today], days: Object.entries(days).map(([date, v]) => ({ date, v: Math.round(v) })), unit: ' kg' });

    root.querySelector('#exSel').onchange = (e) => { st.name = e.target.value; drawExercise(root, ids, valid, today); };
    root.querySelectorAll('[data-rng]').forEach(b => b.onclick = () => { st.range = +b.dataset.rng; root.querySelectorAll('[data-rng]').forEach(x => x.classList.toggle('on', x === b)); drawExercise(root, ids, valid, today); });
  }

  function drawExercise(root, ids, logs, today) {
    const all = M().withPRs(M().history(logs, st.name)), from = st.range >= 9999 ? '0000-00-00' : M().addDays(today, -st.range), pts = all.filter(p => p.date >= from);
    const chip = root.querySelector('#exChip'), plateau = M().plateau(all, today);
    const last3 = all.slice(-3), trendUp = last3.length === 3 && last3[2].e1rm > last3[0].e1rm;
    chip.innerHTML = plateau ? '<span class="hl-chip"><span class="dot" style="background:var(--orange)"></span>PLATEAU · NO NEW BEST IN 4+ WEEKS</span>' : trendUp ? '<span class="hl-chip"><span class="dot"></span>TRENDING UP</span>' : '';
    const c = window.ethosChart(ids.prog);
    if (!pts.length) { c.clear(); return; }
    c.setOption({ grid: { left: 46, right: 46, top: 24, bottom: 26 }, tooltip: { trigger: 'axis' }, legend: { top: 0, right: 0 },
      xAxis: { type: 'category', data: pts.map(p => F.short(p.date)), axisLabel: { interval: Math.max(0, Math.ceil(pts.length / 10) - 1) } }, yAxis: [{ type: 'value', scale: true, name: 'e1RM kg', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } }, { type: 'value', scale: true, name: 'kg', splitLine: { show: false }, nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } }],
      series: [Object.assign(window.bkArea('#76b372', { fillOpacity: 0.12 }), { name: 'Est. 1RM', data: pts.map(p => p.e1rm), symbol: 'circle', symbolSize: (v, p) => (pts[p.dataIndex].pr ? 11 : 4), itemStyle: { color: (p) => (pts[p.dataIndex].pr ? '#a5f79e' : '#76b372') } }),
        { type: 'scatter', name: 'Top set kg', yAxisIndex: 1, data: pts.map(p => p.weight), symbolSize: 6, itemStyle: { color: '#3b82f6' }, tooltip: { valueFormatter: (v) => v + ' kg' } }] }, true);
    root.querySelector('#exTbl').innerHTML = `<table class="hl-table"><tr><th>Date</th><th>Top set</th><th>e1RM</th><th>Sets</th></tr>${all.slice(-8).reverse().map(p => `<tr><td>${p.date}</td><td>${p.weight} × ${p.reps}</td><td>${p.e1rm}${p.pr ? ' <span class="hl-code" style="color:var(--sig-900);border-color:var(--sig-900)">PR</span>' : ''}</td><td>${p.sets}</td></tr>`).join('')}</table>`;
  }

  function drawWeekly(root, ids, logs, muscleOf, today) {
    const wk = M().weeklySets(logs, muscleOf, today, st.weeks), keys = Object.keys(wk), muscles = [...new Set(keys.flatMap(k => Object.keys(wk[k])))].sort();
    const c = window.ethosChart(ids.wk);
    c.setOption({ grid: { left: 42, right: 14, top: 32, bottom: 26 }, tooltip: { trigger: 'axis' }, legend: { top: 0, right: 0, type: 'scroll' }, xAxis: { type: 'category', data: keys.map(F.short) }, yAxis: { type: 'value', name: 'sets', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
      series: muscles.map((m, i) => ({ type: 'bar', stack: 't', name: m, data: keys.map(k => wk[k][m] || 0), itemStyle: { color: PALETTE[i % PALETTE.length] }, barMaxWidth: 34 })) }, true);
    const thisWeek = wk[keys.at(-1)] || {}, volBy = {};
    logs.filter(l => M().weekStart(l.date) === keys.at(-1)).forEach(l => (l.exercises || []).forEach(ex => { const m = muscleOf(String(ex.name).trim().toUpperCase()) || 'OTHER'; volBy[m] = (volBy[m] || 0) + (ex.sets || []).reduce((s, x) => s + (x && x.weight > 0 && x.reps > 0 ? x.weight * x.reps : 0), 0); }));
    const rows = muscles.map(m => ({ m, n: thisWeek[m] || 0 })).sort((a, b) => b.n - a.n);
    root.querySelector('#wkTbl').innerHTML = rows.length ? `<table class="hl-table"><tr><th>Muscle</th><th>Sets</th><th>Volume</th><th>vs 10-20</th></tr>${rows.map(r => {
      const tag = r.m === 'OTHER' ? ['—', 'var(--text-muted)'] : r.n === 0 ? ['NOT TRAINED', 'var(--text-muted)'] : r.n < 10 ? ['UNDER', 'var(--orange)'] : r.n <= 20 ? ['IN RANGE', 'var(--green)'] : ['HIGH', 'var(--orange)'];
      return `<tr><td>${esc(r.m)}</td><td>${r.n}</td><td>${F.num(Math.round(volBy[r.m] || 0))} kg</td><td><span class="hl-note" style="color:${tag[1]}">${tag[0]}</span></td></tr>`; }).join('')}</table>` : G.empty('NOTHING LOGGED IN THE LAST 8 WEEKS');
  }

  // The gym page markup is static HTML, so it exists by the time deferred scripts run.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
