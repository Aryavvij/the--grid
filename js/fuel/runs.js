/* Runs page: import Strava exports, monthly/yearly overview, personal bests, run detail. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const BEST = [['1000', '1 KM'], ['1609', '1 MILE'], ['3000', '3 KM'], ['5000', '5 KM'], ['10000', '10 KM'], ['15000', '15 KM'], ['21098', '21 KM']];
  const ZCOL = ['#3b82f6', '#14b8a6', '#76b372', '#f97316', '#ef4444'];
  const st = { mode: 'year', year: null, month: null, detail: null, sort: ['date', -1], bestKey: '5000', report: null, importing: null, showAllRuns: false };

  const pace = (r) => r.movingSec / (r.distanceM / 1000);
  const dowIdx = (iso) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;
  const summarise = (rs) => {
    const dist = S.sum(rs.map(r => r.distanceM)), sec = S.sum(rs.map(r => r.movingSec));
    return { runs: rs.length, dist, sec, pace: dist ? sec / (dist / 1000) : null, hr: S.avg(rs.map(r => r.avgHr)), elev: S.sum(rs.map(r => r.elevGainM)), longest: Math.max(0, ...rs.map(r => r.distanceM)), cal: S.sum(rs.map(r => r.calories)) };
  };
  const delta = (a, b) => (b ? ((a - b) / b) * 100 : null);
  const tFmt = (sec) => F.dur(sec);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Fastest time per target across all runs, plus which run set it. */
  function personalBests(all) {
    const out = {};
    for (const [k] of BEST) {
      let best = null; all.forEach(r => { const v = r.bestEfforts && (r.bestEfforts[k] || (k === '21098' ? r.bestEfforts['21000'] : null)); if (v && (!best || v < best.sec)) best = { sec: v, run: r }; });
      if (best) out[k] = best;
    }
    return out;
  }

  G.registerPage('runs', {
    sub: 'Strava exports · monthly and yearly overview', dot: 'var(--green)', foot: 'Run metrics are computed from your imported files.',
    async render(root) {
      st.detail = null;                                     // always open on the list, never a stale detail view
      st.report = null; st.importing = null;               // and never an old import report
      let all = [];
      const load = async () => { all = (await G.data('runs', { limit: 5000 })).slice().sort((a, b) => (a.startTime < b.startTime ? -1 : 1)); };
      await load();

      const doImport = async (fileList) => {
        const files = [...fileList]; if (!files.length) return;
        st.importing = { done: 0, total: files.length, name: '' }; st.report = null; draw();
        const rep = await G.runImport.run(files, { existing: all, onProgress: (p) => { st.importing = p; const bar = root.querySelector('#impBar'); if (bar) { bar.style.width = Math.round((p.done / Math.max(1, p.total)) * 100) + '%'; root.querySelector('#impName').textContent = p.name; } } });
        st.importing = null; st.report = rep; await load(); draw();
      };

      const importCard = () => {
        if (st.importing) return G.card('IMPORTING', `<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.07)"><div id="impBar" style="height:100%;width:0;background:var(--green);border-radius:3px;transition:width .2s"></div></div><div class="hl-note" id="impName" style="margin-top:8px">READING FILES…</div>`);
        const r = st.report;
        const rep = r ? `<div style="margin-top:12px;font-size:11px;line-height:1.9">
            <span class="hl-code">${r.imported} IMPORTED</span> <span class="hl-code" style="color:var(--text-muted);border-color:var(--card-border)">${r.duplicates} DUPLICATES</span>
            <span class="hl-code" style="color:var(--orange);border-color:var(--orange)">${r.skipped.length} SKIPPED</span> <span class="hl-code" style="color:var(--red);border-color:var(--red)">${r.failed.length} FAILED</span>
            <span class="hl-note"> ${r.ignored} NON-ACTIVITY FILES IGNORED</span>
            ${r.uploadError ? `<div style="color:var(--red)">UPLOAD ERROR: ${esc(r.uploadError)}</div>` : ''}
            ${[...r.skipped.map(x => ['SKIPPED', x]), ...r.failed.map(x => ['FAILED', x])].slice(0, 12).map(([k, x]) => `<div class="hl-note">${k} · ${esc(x.name)} · ${esc(x.reason)}</div>`).join('')}</div>` : '';
        return G.card('IMPORT STRAVA RUNS', `<div id="drop" style="border:1px dashed var(--carbon-4);border-radius:8px;padding:22px;text-align:center;cursor:pointer;transition:all .15s">
            <div class="hl-note" style="font-size:11px">DROP FILES HERE OR CLICK TO CHOOSE</div>
            <div class="hl-note" style="margin-top:6px">.FIT · .GPX · .TCX · .GZ · STRAVA EXPORT .ZIP · ACTIVITIES.CSV · DUPLICATES ARE SKIPPED AUTOMATICALLY</div></div>${rep}
            <input id="pick" type="file" multiple accept=".fit,.gpx,.tcx,.gz,.zip,.csv" style="display:none">`);
      };

      const draw = () => {
        if (st.detail) return drawDetail();
        if (!all.length) {
          const step = (n, t, b) => `<div style="display:flex;gap:12px;margin-bottom:12px"><span class="hl-code" style="height:fit-content">${n}</span><div><div style="font-size:11px;color:var(--text);margin-bottom:3px">${t}</div><div class="hl-note" style="text-transform:none;line-height:1.7;font-size:10px">${b}</div></div></div>`;
          root.innerHTML = `${importCard()}
            <div class="fin-group-label" style="margin-top:16px">GET YOUR RUNS IN</div>
            <div class="hl-grid hl-g3">
              ${G.card('ALL YOUR RUNS AT ONCE', step(1, 'Request your Strava archive', 'On strava.com: Settings → My Account → Download or Delete Your Account → Request Your Archive.') + step(2, 'Wait for the email', 'Strava emails a download link, usually within minutes to a few hours.') + step(3, 'Drop the .zip here', 'No need to unzip it. Runs, names, gear and calories are read from the archive; rides and walks are skipped.'))}
              ${G.card('ONE RUN AT A TIME', step(1, 'Open the run on strava.com', 'Use the activity page, not the phone app.') + step(2, 'Menu (•••) → Export GPX or Export Original', 'GPX, TCX and original FIT files all work, with or without .gz.') + step(3, 'Drop the file above', 'Importing the same run twice is safe: duplicates are skipped automatically.'))}
              ${G.card('WHAT YOU GET', '<div class="hl-note" style="text-transform:none;line-height:2;font-size:10px">Monthly and yearly overview with year-over-year comparison<br>Personal bests: 1 km, 1 mile, 3 km, 5 km, 10 km, half marathon<br>Pace vs heart rate fitness trend and HR zones<br>Weekly mileage with a ramp-up warning<br>Shoe mileage<br>Run detail: route map, splits, linked pace, heart rate, elevation and cadence charts<br>Compare any run with a similar one</div>')}
            </div>
            <div class="fin-group-label">OVERVIEW</div><div id="t1"></div>`;
          G.tiles(root.querySelector('#t1'), [{ label: 'DISTANCE', value: '—', unit: 'km' }, { label: 'RUNS', value: '—' }, { label: 'MOVING TIME', value: '—' }, { label: 'AVG PACE', value: '—', unit: '/km' }]);
          return bind();
        }
        const years = [...new Set(all.map(r => +r.date.slice(0, 4)))].sort();
        if (!years.includes(st.year)) st.year = years.at(-1);
        if (st.month == null) st.month = +all.at(-1).date.slice(5, 7) - 1;
        const yr = all.filter(r => +r.date.slice(0, 4) === st.year);
        const inP = st.mode === 'year' ? yr : yr.filter(r => +r.date.slice(5, 7) - 1 === st.month);
        const cutoff = yr.length ? yr.at(-1).date.slice(5) : '12-31';
        const prevP = st.mode === 'year' ? all.filter(r => +r.date.slice(0, 4) === st.year - 1 && r.date.slice(5) <= cutoff)
          : all.filter(r => { const d = new Date(st.year, st.month - 1, 1); return +r.date.slice(0, 4) === d.getFullYear() && +r.date.slice(5, 7) - 1 === d.getMonth(); });
        const cur = summarise(inP), prv = summarise(prevP), vs = st.mode === 'year' ? 'vs last yr' : 'vs last mo';
        const ids = {}; ['main', 'heat', 'pace', 'yoy', 'wk', 'hist', 'dow', 'tod', 'sc', 'zones', 'pr'].forEach(k => { ids[k] = G.uid(); });

        root.innerHTML = `${importCard()}
          <div class="hl-grid" style="grid-template-columns:auto auto 1fr;align-items:center;margin:14px 0">
            <div class="hl-pills">${['month', 'year'].map(m => `<button class="hl-pill ${st.mode === m ? 'on' : ''}" data-mode="${m}">${m}</button>`).join('')}</div>
            <div class="hl-pills">${years.map(y => `<button class="hl-pill ${st.year === y ? 'on' : ''}" data-year="${y}">${y}</button>`).join('')}</div>
            <div style="text-align:right"><button class="hl-btn pri" id="upBtn">+ IMPORT RUNS</button></div></div>
          ${st.mode === 'month' ? `<div class="hl-pills" style="margin-bottom:14px">${MONTHS.map((m, i) => `<button class="hl-pill ${st.month === i ? 'on' : ''}" data-month="${i}">${m}</button>`).join('')}</div>` : ''}
          <div class="fin-group-label">OVERVIEW</div>
          <div id="t1"></div><div id="t2"></div>
          ${inP.length ? `
          <div class="fin-group-label">TRENDS</div>
          <div style="margin-bottom:14px">
            ${G.card(st.mode === 'year' ? 'YEAR HEATMAP' : 'MONTH CALENDAR', `<div class="hl-chart" id="${ids.heat}" style="height:155px;width:100%"></div>`)}
          </div>
          <div class="hl-grid hl-g2">
            ${G.card(st.mode === 'year' ? 'DISTANCE BY MONTH · KM' : 'WEEKLY MILEAGE · KM', `<div class="hl-chart sm" id="${ids.main}"></div>`)}
            ${st.mode === 'year' ? G.card('CUMULATIVE DISTANCE · THIS YEAR VS LAST', `<div class="hl-chart sm" id="${ids.yoy}"></div>`) : G.card('PACE VS HEART RATE', `<div class="hl-chart sm" id="${ids.sc}"></div>`, '<span class="hl-note">DOWN-RIGHT OVER TIME = FITTER</span>')}
          </div>
          ${st.mode === 'year' ? `<div class="hl-grid hl-g2">
            ${G.card('AVERAGE PACE BY MONTH · MIN/KM', `<div class="hl-chart sm" id="${ids.pace}"></div>`, '<span class="hl-note">LOWER IS FASTER</span>')}
            ${G.card('PACE VS HEART RATE', `<div class="hl-chart sm" id="${ids.sc}"></div>`, '<span class="hl-note">DOWN-RIGHT OVER TIME = FITTER</span>')}
          </div>
          <div class="hl-grid hl-g21">
            ${G.card('WEEKLY DISTANCE · 4-WEEK AVERAGE', `<div class="hl-chart sm" id="${ids.wk}"></div>`, '<span id="ramp"></span>')}
            ${G.card('RUN LENGTH', `<div class="hl-chart sm" id="${ids.hist}"></div>`)}
          </div>` : ''}
          <div class="hl-grid hl-g3">
            ${G.card('DAY OF WEEK', `<div class="hl-chart sm" id="${ids.dow}"></div>`)}
            ${G.card('TIME OF DAY', `<div class="hl-chart sm" id="${ids.tod}"></div>`)}
            ${G.card('HEART-RATE ZONES', `<div class="hl-chart sm" id="${ids.zones}"></div>`)}
          </div>` : G.empty('NO RUNS IN THIS PERIOD')}
          <div class="fin-group-label">RECORDS</div>
          ${G.card('PERSONAL BESTS', '<div id="pbs"></div>', '<span class="hl-note">FASTEST WINDOW WITHIN A RUN · NEEDS A TRACK FILE</span>')}
          <div class="fin-group-label" style="margin-top:16px">ALL RUNS</div>
          ${G.card('RUNS', '<div id="list"></div>', '<button class="hl-btn" id="expCsv">EXPORT CSV</button>')}`;

        G.tiles(root.querySelector('#t1'), [
          { label: 'DISTANCE', value: F.km(cur.dist), unit: 'km', delta: delta(cur.dist, prv.dist), goodWhen: 'up', vs },
          { label: 'RUNS', value: cur.runs, delta: delta(cur.runs, prv.runs), goodWhen: 'up', vs },
          { label: 'MOVING TIME', value: F.hm(cur.sec / 60), delta: delta(cur.sec, prv.sec), vs },
          { label: 'AVG PACE', value: F.pace(cur.pace).replace(' /km', ''), unit: '/km', delta: delta(cur.pace, prv.pace), goodWhen: 'down', vs }]);
        G.tiles(root.querySelector('#t2'), [
          { label: 'AVG HEART RATE', value: cur.hr ? Math.round(cur.hr) : '—', unit: 'bpm' }, { label: 'ELEVATION GAIN', value: F.num(cur.elev), unit: 'm' },
          { label: 'LONGEST RUN', value: F.km(cur.longest), unit: 'km' }, { label: 'CALORIES', value: F.num(cur.cal), unit: 'kcal' }]);

        if (inP.length) charts(inP, yr, ids);
        pbs(); list(inP); bind();
      };

      const charts = (inP, yr, ids) => {
        if (st.mode === 'year') {
          const byM = MONTHS.map((_, m) => yr.filter(r => +r.date.slice(5, 7) - 1 === m));
          G.bars(ids.main, { x: MONTHS, y: byM.map(rs => +(S.sum(rs.map(r => r.distanceM)) / 1000).toFixed(1)), unit: 'km' });
          G.heat(ids.heat, { range: String(st.year), days: yr.map(r => ({ date: r.date, v: r.distanceM / 1000 })), unit: ' km' });
          G.line(ids.pace, { x: MONTHS, y: byM.map(rs => { const s = summarise(rs); return s.pace ? +(s.pace / 60).toFixed(2) : null; }), name: 'Pace', unit: 'min/km', band: false });
          // cumulative distance, this year vs last
          const cum = (rs, y) => { let t = 0; const m = Array(12).fill(null); const by = Array.from({ length: 12 }, (_, i) => S.sum(rs.filter(r => +r.date.slice(0, 4) === y && +r.date.slice(5, 7) - 1 === i).map(r => r.distanceM)) / 1000); const lastM = rs.filter(r => +r.date.slice(0, 4) === y).reduce((a, r) => Math.max(a, +r.date.slice(5, 7) - 1), -1); by.forEach((v, i) => { t += v; if (i <= lastM) m[i] = +t.toFixed(1); }); return m; };
          const yc = window.ethosChart(ids.yoy);
          yc.setOption({ grid: { left: 42, right: 14, top: 28, bottom: 26 }, tooltip: { trigger: 'axis' }, legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: MONTHS }, yAxis: { type: 'value', name: 'km', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
            series: [{ name: String(st.year), type: 'line', data: cum(all, st.year), symbol: 'none', lineStyle: { color: '#76b372', width: 2 }, connectNulls: false }, { name: String(st.year - 1), type: 'line', data: cum(all, st.year - 1), symbol: 'none', lineStyle: { color: '#9b59b6', width: 2, type: 'dashed' } }] }, true);
          // weekly distance + 4-week rolling average + ramp warning (weeks start Monday)
          const wkOf = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return F.date(d); };
          const wk = {}; yr.forEach(r => { const k = wkOf(r.date); wk[k] = (wk[k] || 0) + r.distanceM / 1000; });
          const keys = Object.keys(wk).sort(), vals = keys.map(k => +wk[k].toFixed(1));
          const roll = vals.map((_, i) => +S.avg(vals.slice(Math.max(0, i - 3), i + 1)).toFixed(1));
          const wc = window.ethosChart(ids.wk);
          wc.setOption({ grid: { left: 42, right: 14, top: 22, bottom: 26 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: keys.map(F.short), axisLabel: { interval: Math.ceil(keys.length / 10) } }, yAxis: { type: 'value', name: 'km', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
            series: [Object.assign(window.bkBar('#76b372', { count: vals.length }), { name: 'Week km', data: vals }), { type: 'line', name: '4-wk avg', data: roll, symbol: 'none', lineStyle: { color: '#f97316', width: 2 } }] }, true);
          if (vals.length >= 3) { const last = vals.at(-2) ?? vals.at(-1), base = S.avg(vals.slice(Math.max(0, vals.length - 6), vals.length - 2)); const r = base ? ((last - base) / base) * 100 : 0;
            root.querySelector('#ramp').innerHTML = `<span class="hl-chip"><span class="dot" style="background:${r > 10 ? 'var(--orange)' : 'var(--green)'}"></span>LAST WEEK ${r >= 0 ? '+' : ''}${r.toFixed(0)}% ${r > 10 ? '· RAMPING FAST' : '· STEADY'}</span>`; }
          const bins = [[0, 3, '<3'], [3, 5, '3-5'], [5, 8, '5-8'], [8, 12, '8-12'], [12, 21, '12-21'], [21, 999, '21+']];
          G.bars(ids.hist, { x: bins.map(b => b[2] + ' km'), y: bins.map(([a, b]) => inP.filter(r => r.distanceM / 1000 >= a && r.distanceM / 1000 < b).length), unit: 'runs', color: G.colors.teal });
        } else {
          const weeks = {}; inP.forEach(r => { const w = Math.floor((+r.date.slice(8, 10) - 1) / 7); weeks[w] = (weeks[w] || 0) + r.distanceM / 1000; });
          G.bars(ids.main, { x: ['W1', 'W2', 'W3', 'W4', 'W5'], y: [0, 1, 2, 3, 4].map(w => +(weeks[w] || 0).toFixed(1)), unit: 'km' });
          G.heat(ids.heat, { range: st.year + '-' + String(st.month + 1).padStart(2, '0'), days: inP.map(r => ({ date: r.date, v: r.distanceM / 1000 })), unit: ' km' });
        }
        G.bars(ids.dow, { x: DOW, y: DOW.map((_, i) => inP.filter(r => dowIdx(r.date) === i).length), unit: 'runs', color: G.colors.blue });
        const tod = [['EARLY <7', 0, 7], ['7-10', 7, 10], ['10-16', 10, 16], ['16-20', 16, 20], ['EVE 20+', 20, 24]];
        G.bars(ids.tod, { x: tod.map(t => t[0]), y: tod.map(([, a, b]) => inP.filter(r => { const h = new Date(r.startTime).getHours(); return h >= a && h < b; }).length), unit: 'runs', color: G.colors.purple });
        const zsum = [1, 2, 3, 4, 5].map(i => S.sum(inP.map(r => (r.hrZones && r.hrZones['z' + i]) || 0)));
        const zc = window.ethosChart(ids.zones);
        if (zsum.some(v => v > 0)) zc.setOption({ tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br>${F.hm(p.value / 60)} (${p.percent}%)` }, legend: { show: false },
          series: [Object.assign(window.bkPie({ radius: ['55%', '85%'] }), { data: zsum.map((v, i) => ({ name: 'Zone ' + (i + 1), value: v, itemStyle: { color: ZCOL[i] } })), label: { show: true, formatter: '{b}', color: 'rgba(240,240,240,.65)', fontSize: 9 } })] }, true);
        else root.querySelector('#' + ids.zones).innerHTML = G.empty('NO HEART-RATE DATA IN THESE RUNS');
        const sc = window.ethosChart(ids.sc), withHr = inP.filter(r => r.avgHr);
        sc.setOption({ grid: { left: 46, right: 14, top: 14, bottom: 30 }, tooltip: { formatter: (p) => `${p.data[3]}<br>${F.pace(p.data[0] * 60)} · ${p.data[1]} bpm` },
          visualMap: { show: false, dimension: 2, min: 0, max: 11, inRange: { color: ['#3b6839', '#a5f79e'] } },
          xAxis: { type: 'value', scale: true, name: 'min/km', nameLocation: 'middle', nameGap: 20, nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 }, inverse: true }, yAxis: { type: 'value', scale: true, name: 'bpm', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
          series: [{ type: 'scatter', symbolSize: 8, data: withHr.map(r => [+(pace(r) / 60).toFixed(2), r.avgHr, +r.date.slice(5, 7) - 1, r.date]) }] }, true);
      };

      const pbs = () => {
        const pb = personalBests(all), el = root.querySelector('#pbs');
        if (!Object.keys(pb).length) { el.innerHTML = G.empty('NO BEST EFFORTS YET<br>Import .fit / .gpx / .tcx files (CSV summaries have no track)'); return; }
        const thisYear = String(st.year);
        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:0">${BEST.filter(([k]) => pb[k]).map(([k, label]) => {
          const b = pb[k], fresh = b.run.date.startsWith(thisYear), d = +k;
          return `<div class="fin-stat-card fx-click" style="${st.bestKey === k ? 'border-color:var(--green)' : ''}" data-best="${k}"><div class="fin-stat-label">${label}${fresh ? ' <span style="color:var(--sig-900)">· PR</span>' : ''}</div>
            <div class="fin-stat-val" style="font-size:18px">${tFmt(b.sec)}</div><div class="fx-sub">${F.pace(b.sec / (d / 1000))} · ${b.run.date}</div></div>`; }).join('')}</div>
          <div class="hl-chart sm" id="prChart" style="margin-top:12px"></div><div class="hl-note" style="text-align:center">${(BEST.find(b => b[0] === st.bestKey) || [])[1] || ''} · EVERY RUN (DOTS) AND RUNNING BEST (LINE)</div>`;
        const pts = all.filter(r => r.bestEfforts && (r.bestEfforts[st.bestKey] || (st.bestKey === '21098' ? r.bestEfforts['21000'] : null))).map(r => [r.date, r.bestEfforts[st.bestKey] || r.bestEfforts['21000']]);
        let m = Infinity; const line = pts.map(([d, v]) => { m = Math.min(m, v); return [d, m]; });
        window.ethosChart('prChart').setOption({ grid: { left: 52, right: 14, top: 14, bottom: 26 }, tooltip: { trigger: 'axis', valueFormatter: (v) => tFmt(v) }, xAxis: { type: 'time' },
          yAxis: { type: 'value', scale: true, inverse: true, axisLabel: { formatter: (v) => tFmt(v) } },
          series: [{ type: 'scatter', data: pts, symbolSize: 6, itemStyle: { color: 'rgba(118,179,114,.5)' } }, { type: 'line', data: line, step: 'end', symbol: 'none', lineStyle: { color: '#a5f79e', width: 2 } }] }, true);
      };

      const list = (inP) => {
        const [key, dir] = st.sort, val = { date: (r) => r.startTime, distance: (r) => r.distanceM, time: (r) => r.movingSec, pace: pace, hr: (r) => r.avgHr || 0, elev: (r) => r.elevGainM || 0 }[key];
        const sorted = inP.slice().sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
        const limit = st.showAllRuns ? sorted.length : 8;
        const rows = sorted.slice(0, limit);
        const th = (k, label) => `<th data-sort="${k}" style="cursor:pointer">${label}${st.sort[0] === k ? (st.sort[1] < 0 ? ' ▼' : ' ▲') : ''}</th>`;
        root.querySelector('#list').innerHTML = `
          <div style="max-height:${st.showAllRuns ? '380px' : 'none'}; overflow-y:${st.showAllRuns ? 'auto' : 'visible'}; padding-right:2px;">
            <table class="hl-table">
              <thead><tr>${th('date', 'Date')}<th>Name</th>${th('distance', 'Distance')}${th('time', 'Time')}${th('pace', 'Pace')}${th('hr', 'Avg HR')}${th('elev', 'Elev')}</tr></thead>
              <tbody>${rows.map(r => `<tr data-run="${r.id}" style="cursor:pointer"><td>${r.date}</td><td>${esc(r.name || 'Run')}</td><td>${F.km(r.distanceM, 2)} km</td><td>${tFmt(r.movingSec)}</td><td>${F.pace(pace(r))}</td><td>${r.avgHr || '—'}</td><td>${Math.round(r.elevGainM || 0)} m</td></tr>`).join('')}</tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
            <div class="hl-note">${st.showAllRuns ? `SHOWING ALL ${sorted.length} RUNS (SCROLLABLE)` : `SHOWING LATEST ${Math.min(8, sorted.length)} OF ${sorted.length} RUNS`} · CLICK A HEADER TO SORT</div>
            ${sorted.length > 8 ? `<button class="hl-btn" id="toggleAllRuns">${st.showAllRuns ? 'SHOW LATEST 8' : `SEE ALL RUNS (${sorted.length})`}</button>` : ''}
          </div>`;
      };

      // ── run detail ──────────────────────────────────────────
      const drawDetail = async () => {
        root.innerHTML = '<div class="hl-empty">LOADING RUN…</div>';
        let r; try { r = G.isDemo() ? G.seed.runDetail(st.detail) : await gridFetch('/api/runs/' + st.detail); } catch (e) { r = null; }
        if (!r) { st.detail = null; return draw(); }
        const ids = {}; ['pace', 'hr', 'ele', 'cad'].forEach(k => { ids[k] = G.uid(); });
        const sp = r.splits || [], secs = sp.map(s => s.sec), fast = secs.length ? Math.min(...secs) : null, slow = secs.length ? Math.max(...secs) : null;
        const half = Math.floor(sp.length / 2), neg = sp.length >= 4 ? S.sum(secs.slice(half)) < S.sum(secs.slice(0, half)) : null;
        const z = r.hrZones, zt = z ? S.sum([1, 2, 3, 4, 5].map(i => z['z' + i] || 0)) : 0;
        root.innerHTML = `<div style="margin-bottom:14px;display:flex;gap:8px;align-items:center"><button class="hl-btn" id="back">← BACK TO RUNS</button><span class="hl-note">${r.date} · ${esc(r.name || 'Run')}${r.gear ? ' · ' + esc(r.gear) : ''} · ${(r.sourceFormat || '').toUpperCase()}</span><span style="flex:1"></span><button class="hl-btn" id="editRun">EDIT</button><button class="hl-btn" id="del" style="color:var(--red);border-color:rgba(239,68,68,.4)">DELETE</button></div>
          <div class="hl-grid hl-g4" id="dt1"></div><div class="hl-grid hl-g4" id="dt2"></div>
          <div class="hl-grid hl-g21">
            ${G.card('ROUTE', r.route ? `<div id="routeBox" style="height:300px"></div>` : G.empty('NO GPS TRACK<br>This run came from a CSV summary'), r.route ? '<span class="hl-note">COLOUR = PACE · GREEN FAST</span>' : '')}
            ${G.card('SPLITS', sp.length ? `<table class="hl-table"><tr><th>Km</th><th>Pace</th><th>HR</th><th>Elev</th></tr>${sp.map(s => `<tr><td>${s.km}</td><td style="color:${s.sec === fast ? 'var(--sig-900)' : s.sec === slow ? 'var(--orange)' : 'inherit'}">${F.pace(s.sec)}</td><td>${s.hr || '—'}</td><td>${s.elevDelta == null ? '—' : (s.elevDelta > 0 ? '+' : '') + s.elevDelta}</td></tr>`).join('')}</table>
              ${neg == null ? '' : `<div class="hl-note" style="margin-top:8px">${neg ? 'NEGATIVE SPLIT: SECOND HALF FASTER' : 'POSITIVE SPLIT: FIRST HALF FASTER'}</div>`}` : G.empty('NO SPLITS'))}
          </div>
          ${r.streams ? `<div class="hl-grid hl-g2">${G.card('PACE · MIN/KM', `<div class="hl-chart sm" id="${ids.pace}"></div>`)}${G.card('HEART RATE · BPM', `<div class="hl-chart sm" id="${ids.hr}"></div>`)}
            ${G.card('ELEVATION · M', `<div class="hl-chart sm" id="${ids.ele}"></div>`)}${G.card('CADENCE · SPM', `<div class="hl-chart sm" id="${ids.cad}"></div>`)}</div>` : ''}
          <div class="hl-grid hl-g2">
            ${G.card('HEART-RATE ZONES', zt ? `<div style="display:flex;height:22px;border-radius:4px;overflow:hidden;margin-bottom:10px">${[1, 2, 3, 4, 5].map(i => `<div title="Z${i}" style="width:${((z['z' + i] || 0) / zt) * 100}%;background:${ZCOL[i - 1]}"></div>`).join('')}</div>
              <table class="hl-table">${[1, 2, 3, 4, 5].map(i => `<tr><td><span class="hl-code" style="color:${ZCOL[i - 1]};border-color:${ZCOL[i - 1]}">Z${i}</span></td><td>${F.hm((z['z' + i] || 0) / 60)}</td><td>${Math.round(((z['z' + i] || 0) / zt) * 100)}%</td></tr>`).join('')}</table>` : G.empty('NO HEART-RATE DATA'))}
            ${G.card('BEST EFFORTS IN THIS RUN', r.bestEfforts && Object.keys(r.bestEfforts).length ? `<table class="hl-table">${BEST.filter(([k]) => r.bestEfforts[k]).map(([k, l]) => `<tr><td>${l}</td><td>${tFmt(r.bestEfforts[k])}</td><td>${F.pace(r.bestEfforts[k] / (+k / 1000))}</td></tr>`).join('')}</table>` : G.empty('NO BEST EFFORTS'))}
          </div>
          <div class="fin-group-label">COMPARE</div>
          ${G.card('COMPARE WITH ANOTHER RUN', '<div id="cmpBox"></div>', '<span class="hl-note">RUNS WITHIN 30% OF THIS DISTANCE</span>')}`;
        G.tiles(root.querySelector('#dt1'), [{ label: 'DISTANCE', value: F.km(r.distanceM, 2), unit: 'km' }, { label: 'MOVING TIME', value: tFmt(r.movingSec) }, { label: 'AVG PACE', value: F.pace(pace(r)).replace(' /km', ''), unit: '/km' }, { label: 'ELAPSED', value: r.elapsedSec ? tFmt(r.elapsedSec) : '—' }]);
        G.tiles(root.querySelector('#dt2'), [{ label: 'AVG / MAX HR', value: r.avgHr ? r.avgHr + ' / ' + (r.maxHr || '—') : '—', unit: 'bpm' }, { label: 'CADENCE', value: r.cadence || '—', unit: 'spm' }, { label: 'ELEVATION GAIN', value: Math.round(r.elevGainM || 0), unit: 'm' }, { label: 'CALORIES', value: r.calories || '—', unit: 'kcal' }]);
        if (r.route) drawRoute(root.querySelector('#routeBox'), r);
        if (r.streams) {
          const x = r.streams.dist.map(d => (d / 1000).toFixed(2)), mk = (id, y, color, fmt) => { const c = window.ethosChart(id); c.setOption({ grid: { left: 46, right: 14, top: 14, bottom: 26 }, tooltip: { trigger: 'axis', valueFormatter: fmt }, axisPointer: { link: [{ xAxisIndex: 'all' }] },
            xAxis: { type: 'category', data: x, axisLabel: { interval: Math.ceil(x.length / 8) - 1, formatter: (v) => v + ' km' } }, yAxis: { type: 'value', scale: true, ...(id === ids.pace ? { inverse: true, axisLabel: { formatter: (v) => F.pace(v).replace(' /km', '') } } : {}) },
            series: [Object.assign(window.bkArea(color, { fillOpacity: 0.15 }), { data: y, connectNulls: true })] }, true); return c; };
          const cs = [mk(ids.pace, r.streams.pace, '#76b372', (v) => F.pace(v)), mk(ids.hr, r.streams.hr, '#ef4444', (v) => v + ' bpm'), mk(ids.ele, r.streams.ele, '#9b59b6', (v) => v + ' m'), mk(ids.cad, r.streams.cad, '#14b8a6', (v) => v + ' spm')];
          echarts.connect(cs);
        }
        root.querySelector('#back').onclick = () => { st.detail = null; draw(); };
        root.querySelector('#editRun').onclick = () => G.modal('EDIT RUN', `${G.field('Name', G.input('name', r.name || '', 'maxlength="200" placeholder="e.g. Sunday long run"'))}${G.field('Gear (shoes)', G.input('gear', r.gear || '', 'maxlength="120" list="gearList" placeholder="e.g. Pegasus 40"'))}<datalist id="gearList">${[...new Set(all.map(x => x.gear).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist>
          <div class="hl-note" style="text-transform:none;line-height:1.7">Distance, time and heart rate come from the file and can't be edited.</div><div class="modal-actions"><button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-save" data-save>SAVE</button></div>`, (m, close) => {
          m.querySelector('[data-save]').onclick = async () => {
            const patch = { name: m.querySelector('[name=name]').value.trim() || null, gear: m.querySelector('[name=gear]').value.trim() || null };
            try { if (G.isDemo()) G.seed.updateRun(r.id, patch); else await gridFetch('/api/runs/' + r.id, { method: 'PUT', body: JSON.stringify(patch) }); } catch (e) { return G.toast((e.message || 'SAVE FAILED').toUpperCase()); }
            close(); await load(); G.toast('RUN UPDATED'); drawDetail();
          };
        }, 440);
        setupCompare(r);
        root.querySelector('#del').onclick = async () => {
          if (!confirm('Delete this run? This cannot be undone.')) return;
          try { if (G.isDemo()) G.seed.removeRun(r.id); else await gridFetch('/api/runs/' + r.id, { method: 'DELETE' }); } catch (e) { G.toast('DELETE FAILED'); return; }
          st.detail = null; await load(); draw();
        };
      };

      /** Compare this run with another of similar length: pace overlay by distance + a metric table. */
      const setupCompare = (r) => {
        const box = root.querySelector('#cmpBox'); if (!box) return;
        const cand = all.filter(x => x.id !== r.id && Math.abs(x.distanceM - r.distanceM) <= r.distanceM * 0.3).sort((a, b) => Math.abs(a.distanceM - r.distanceM) - Math.abs(b.distanceM - r.distanceM)).slice(0, 40).sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
        if (!cand.length) { box.innerHTML = G.empty('NO OTHER RUN WITHIN 30% OF THIS DISTANCE YET'); return; }
        box.innerHTML = `<select class="form-select" id="cmpSel" style="margin-bottom:14px"><option value="">Choose a run to compare…</option>${cand.map(x => `<option value="${x.id}">${x.date} · ${esc(x.name || 'Run')} · ${F.km(x.distanceM, 2)} km · ${F.pace(pace(x))}</option>`).join('')}</select><div id="cmpOut"></div>`;
        box.querySelector('#cmpSel').onchange = async (e) => {
          const out = box.querySelector('#cmpOut'); if (!e.target.value) { out.innerHTML = ''; return; }
          out.innerHTML = G.empty('LOADING…');
          let o; try { o = G.isDemo() ? G.seed.runDetail(e.target.value) : await gridFetch('/api/runs/' + e.target.value); } catch (err) { o = null; }
          if (!o) { out.innerHTML = G.empty('COULD NOT LOAD THAT RUN'); return; }
          const diff = (a, b, fmt, lowerBetter) => { if (a == null || b == null) return '—'; const d = a - b; if (!d) return '='; return `<span style="color:${(d < 0) === !!lowerBetter ? 'var(--green)' : 'var(--orange)'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`; };
          const rows = [['Distance', F.km(r.distanceM, 2) + ' km', F.km(o.distanceM, 2) + ' km', diff(r.distanceM, o.distanceM, v => F.km(v, 2) + ' km', false)], ['Time', F.dur(r.movingSec), F.dur(o.movingSec), diff(r.movingSec, o.movingSec, F.dur, true)],
            ['Pace', F.pace(pace(r)), F.pace(pace(o)), diff(pace(r), pace(o), v => Math.round(v) + ' s/km', true)], ['Avg HR', r.avgHr || '—', o.avgHr || '—', diff(r.avgHr, o.avgHr, v => v + ' bpm', true)],
            ['Elevation', Math.round(r.elevGainM || 0) + ' m', Math.round(o.elevGainM || 0) + ' m', diff(r.elevGainM || 0, o.elevGainM || 0, v => Math.round(v) + ' m', false)], ['Cadence', r.cadence || '—', o.cadence || '—', diff(r.cadence, o.cadence, v => v + ' spm', false)]];
          const cid = G.uid();
          out.innerHTML = `<div class="hl-grid hl-g2" style="margin-bottom:0"><div class="hl-chart sm" id="${cid}"></div><table class="hl-table"><tr><th></th><th>This run</th><th>${o.date}</th><th>Diff</th></tr>${rows.map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td></tr>`).join('')}</table></div>`;
          const line = (run, color, name) => ({ type: 'line', name, symbol: 'none', lineStyle: { color, width: 2 }, data: run.streams ? run.streams.dist.map((d, i) => [d / 1000, run.streams.pace[i]]).filter(p => p[1]) : [] });
          const c = window.ethosChart(cid);
          c.setOption({ grid: { left: 46, right: 14, top: 28, bottom: 26 }, tooltip: { trigger: 'axis', valueFormatter: (v) => F.pace(v) }, legend: { top: 0, right: 0 }, xAxis: { type: 'value', name: 'km', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
            yAxis: { type: 'value', scale: true, inverse: true, axisLabel: { formatter: (v) => F.pace(v).replace(' /km', '') } }, series: [line(r, '#76b372', 'This run'), line(o, '#9b59b6', o.date)] }, true);
        };
      };

      /** Stylised route: SVG polyline segments coloured by pace (green fast, orange slow). */
      const drawRoute = (box, r) => {
        const pts = r.route, W = 600, H = 300, pad = 18;
        const lat = pts.map(p => p[0]), lon = pts.map(p => p[1]), la0 = Math.min(...lat), la1 = Math.max(...lat), lo0 = Math.min(...lon), lo1 = Math.max(...lon);
        const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180), spanX = Math.max(1e-5, (lo1 - lo0) * kx), spanY = Math.max(1e-5, la1 - la0), sc = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
        const ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2, X = (lo) => ox + (lo - lo0) * kx * sc, Y = (la) => H - (oy + (la - la0) * sc);
        const paces = (r.streams && r.streams.pace) || [], pv = paces.filter(Boolean), pmin = Math.min(...pv), pmax = Math.max(...pv);
        const col = (i) => { const p = paces[Math.round((i / (pts.length - 1)) * (paces.length - 1))]; if (!p || pmax === pmin) return '#76b372'; const f = (p - pmin) / (pmax - pmin); return `hsl(${Math.round(110 - f * 85)},65%,${Math.round(58 - f * 6)}%)`; };
        let segs = ''; for (let i = 1; i < pts.length; i++) segs += `<line x1="${X(pts[i - 1][1]).toFixed(1)}" y1="${Y(pts[i - 1][0]).toFixed(1)}" x2="${X(pts[i][1]).toFixed(1)}" y2="${Y(pts[i][0]).toFixed(1)}" stroke="${col(i)}" stroke-width="3" stroke-linecap="round"/>`;
        box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="background:var(--carbon-1);border-radius:8px">${segs}
          <circle cx="${X(pts[0][1])}" cy="${Y(pts[0][0])}" r="6" fill="#a5f79e" stroke="#080808" stroke-width="2"/><circle cx="${X(pts.at(-1)[1])}" cy="${Y(pts.at(-1)[0])}" r="6" fill="#ef4444" stroke="#080808" stroke-width="2"/></svg>`;
      };

      const bind = () => {
        const drop = root.querySelector('#drop'), pick = root.querySelector('#pick'), up = root.querySelector('#upBtn');
        if (pick) pick.onchange = () => { doImport(pick.files); pick.value = ''; };
        if (drop) {
          drop.onclick = () => pick.click();
          drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--green)'; drop.style.background = 'var(--green-dim)'; };
          drop.ondragleave = () => { drop.style.borderColor = ''; drop.style.background = ''; };
          drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ''; drop.style.background = ''; doImport(e.dataTransfer.files); };
        }
        if (up) up.onclick = () => pick && pick.click();
        root.querySelectorAll('[data-mode],[data-year],[data-month]').forEach(b => b.onclick = () => {
          if (b.dataset.mode) st.mode = b.dataset.mode; if (b.dataset.year) st.year = +b.dataset.year; if (b.dataset.month != null && b.dataset.month !== '') st.month = +b.dataset.month; draw();
        });
        const exp = root.querySelector('#expCsv');
        if (exp) exp.onclick = () => G.csv('grid-runs.csv', [['date', 'start_time', 'name', 'distance_km', 'moving_time_s', 'pace_s_per_km', 'avg_hr', 'max_hr', 'cadence_spm', 'elevation_gain_m', 'calories', 'gear', 'source'],
          ...all.slice().reverse().map(r => [r.date, r.startTime, r.name, (r.distanceM / 1000).toFixed(3), r.movingSec, Math.round(pace(r)), r.avgHr, r.maxHr, r.cadence, r.elevGainM, r.calories, r.gear, r.sourceFormat])]);
        const toggleRuns = root.querySelector('#toggleAllRuns');
        if (toggleRuns) toggleRuns.onclick = () => { st.showAllRuns = !st.showAllRuns; list(inP); bind(); };
        root.querySelectorAll('[data-run]').forEach(tr => tr.onclick = () => { st.detail = tr.dataset.run; draw(); });
        root.querySelectorAll('[data-best]').forEach(c => c.onclick = () => { st.bestKey = c.dataset.best; pbs(); bindBest(); });
        root.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => { const k = h.dataset.sort; st.sort = [k, st.sort[0] === k ? -st.sort[1] : -1]; draw(); });
      };
      const bindBest = () => root.querySelectorAll('[data-best]').forEach(c => c.onclick = () => { st.bestKey = c.dataset.best; pbs(); bindBest(); });

      draw();
    },
  });
})();
