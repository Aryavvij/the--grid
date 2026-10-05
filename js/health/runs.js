/* Runs page: monthly and yearly overview of Strava file imports. Importer UI arrives in Phase 4. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const st = { mode: 'year', year: null, month: null };

  const summarise = (rs) => {
    const dist = S.sum(rs.map(r => r.distanceM)), sec = S.sum(rs.map(r => r.movingSec));
    return { runs: rs.length, dist, sec, pace: dist ? sec / (dist / 1000) : null, hr: S.avg(rs.map(r => r.avgHr)), elev: S.sum(rs.map(r => r.elevGainM)), longest: Math.max(0, ...rs.map(r => r.distanceM)), cal: S.sum(rs.map(r => r.calories)) };
  };
  const delta = (a, b) => (b ? ((a - b) / b) * 100 : null);

  G.registerPage('runs', {
    title: 'Runs', sub: 'Strava exports · monthly and yearly overview',
    async render(root) {
      const all = (await G.data('runs', { limit: 5000 })).slice().sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
      if (!all.length) { root.innerHTML = G.empty('NO RUNS YET<br>Upload your Strava export files here (importer arrives in Phase 4).'); return; }
      const years = [...new Set(all.map(r => +r.date.slice(0, 4)))].sort();
      if (!years.includes(st.year)) st.year = years.at(-1);
      if (st.month == null) st.month = (all.at(-1) ? +all.at(-1).date.slice(5, 7) : 1) - 1;

      const draw = () => {
        const yr = all.filter(r => +r.date.slice(0, 4) === st.year);
        const inPeriod = st.mode === 'year' ? yr : yr.filter(r => +r.date.slice(5, 7) - 1 === st.month);
        const cutoff = yr.length ? yr.at(-1).date.slice(5) : '12-31';                   // compare to the same point in last year, not a full year
        const prevPeriod = st.mode === 'year' ? all.filter(r => +r.date.slice(0, 4) === st.year - 1 && r.date.slice(5) <= cutoff)
          : all.filter(r => { const d = new Date(st.year, st.month - 1, 1); return +r.date.slice(0, 4) === d.getFullYear() && +r.date.slice(5, 7) - 1 === d.getMonth(); });
        const cur = summarise(inPeriod), prv = summarise(prevPeriod);
        const ids = ['main', 'heat', 'pace'].reduce((o, k) => (o[k] = G.uid(), o), {});
        const vsLabel = st.mode === 'year' ? 'vs last yr' : 'vs last mo';

        root.innerHTML = `<div class="hl-grid" style="grid-template-columns:auto auto 1fr;align-items:center;margin-bottom:14px">
            <div class="hl-pills">${['month', 'year'].map(m => `<button class="hl-pill ${st.mode === m ? 'on' : ''}" data-mode="${m}">${m}</button>`).join('')}</div>
            <div class="hl-pills">${years.map(y => `<button class="hl-pill ${st.year === y ? 'on' : ''}" data-year="${y}">${y}</button>`).join('')}</div>
            <div style="text-align:right"><button class="hl-btn" disabled title="Importer arrives in Phase 4" style="opacity:.5;cursor:not-allowed">UPLOAD RUNS · PHASE 4</button></div></div>
          ${st.mode === 'month' ? `<div class="hl-pills" style="margin-bottom:14px">${MONTHS.map((m, i) => `<button class="hl-pill ${st.month === i ? 'on' : ''}" data-month="${i}">${m}</button>`).join('')}</div>` : ''}
          <div class="hl-grid hl-g4" id="t1"></div><div class="hl-grid hl-g4" id="t2"></div>
          ${inPeriod.length ? `
          <div class="hl-grid hl-g2">
            ${G.card(st.mode === 'year' ? 'DISTANCE BY MONTH · KM' : 'WEEKLY MILEAGE · KM', `<div class="hl-chart" id="${ids.main}"></div>`)}
            ${G.card(st.mode === 'year' ? 'YEAR HEATMAP' : 'MONTH CALENDAR', `<div class="hl-chart" id="${ids.heat}"></div>`)}
          </div>
          ${st.mode === 'year' ? `<div class="hl-grid hl-g2">${G.card('AVERAGE PACE BY MONTH · MIN/KM', `<div class="hl-chart sm" id="${ids.pace}"></div>`, '<span class="hl-note">LOWER IS FASTER</span>')}${G.card('MONTHLY TABLE', '<div id="mt"></div>')}</div>` : ''}
          ${G.card('RUNS', '<div id="list"></div>')}` : G.empty('NO RUNS IN THIS PERIOD')}`;

        G.tiles(root.querySelector('#t1'), [
          { label: 'DISTANCE', value: F.km(cur.dist), unit: 'km', delta: delta(cur.dist, prv.dist), goodWhen: 'up', vs: vsLabel },
          { label: 'RUNS', value: cur.runs, delta: delta(cur.runs, prv.runs), goodWhen: 'up', vs: vsLabel },
          { label: 'MOVING TIME', value: F.hm(cur.sec / 60), delta: delta(cur.sec, prv.sec), vs: vsLabel },
          { label: 'AVG PACE', value: F.pace(cur.pace).replace(' /km', ''), unit: '/km', delta: delta(cur.pace, prv.pace), goodWhen: 'down', vs: vsLabel },
        ]);
        G.tiles(root.querySelector('#t2'), [
          { label: 'AVG HEART RATE', value: cur.hr ? Math.round(cur.hr) : '—', unit: 'bpm' },
          { label: 'ELEVATION GAIN', value: F.num(cur.elev), unit: 'm' },
          { label: 'LONGEST RUN', value: F.km(cur.longest), unit: 'km' },
          { label: 'CALORIES', value: F.num(cur.cal), unit: 'kcal' },
        ]);
        if (!inPeriod.length) return bind();

        if (st.mode === 'year') {
          const byM = MONTHS.map((_, m) => yr.filter(r => +r.date.slice(5, 7) - 1 === m));
          G.bars(ids.main, { x: MONTHS, y: byM.map(rs => +(S.sum(rs.map(r => r.distanceM)) / 1000).toFixed(1)), unit: 'km' });
          G.heat(ids.heat, { range: String(st.year), days: yr.map(r => ({ date: r.date, v: r.distanceM / 1000 })), unit: ' km' });
          G.line(ids.pace, { x: MONTHS, y: byM.map(rs => { const s = summarise(rs); return s.pace ? +(s.pace / 60).toFixed(2) : null; }), name: 'Pace', unit: 'min/km', band: false });
          root.querySelector('#mt').innerHTML = `<table class="hl-table"><tr><th>Month</th><th>Runs</th><th>Km</th><th>Pace</th><th>Avg HR</th></tr>${byM.map((rs, m) => { const s = summarise(rs);
            return rs.length ? `<tr><td>${MONTHS[m]}</td><td>${s.runs}</td><td>${F.km(s.dist)}</td><td>${F.pace(s.pace).replace(' /km', '')}</td><td>${s.hr ? Math.round(s.hr) : '—'}</td></tr>` : ''; }).join('')}</table>`;
        } else {
          const weeks = {}; inPeriod.forEach(r => { const w = Math.floor((+r.date.slice(8, 10) - 1) / 7); weeks[w] = (weeks[w] || 0) + r.distanceM / 1000; });
          G.bars(ids.main, { x: ['W1', 'W2', 'W3', 'W4', 'W5'], y: [0, 1, 2, 3, 4].map(w => +(weeks[w] || 0).toFixed(1)), unit: 'km' });
          const mm = String(st.month + 1).padStart(2, '0');
          G.heat(ids.heat, { range: st.year + '-' + mm, days: inPeriod.map(r => ({ date: r.date, v: r.distanceM / 1000 })), unit: ' km' });
        }
        root.querySelector('#list').innerHTML = `<table class="hl-table"><tr><th>Date</th><th>Name</th><th>Distance</th><th>Time</th><th>Pace</th><th>Avg HR</th><th>Elev</th></tr>${inPeriod.slice().reverse().slice(0, 15).map(r =>
          `<tr><td>${r.date}</td><td>${r.name || 'Run'}</td><td>${F.km(r.distanceM, 2)} km</td><td>${F.dur(r.movingSec)}</td><td>${F.pace(r.movingSec / (r.distanceM / 1000))}</td><td>${r.avgHr || '—'}</td><td>${Math.round(r.elevGainM || 0)} m</td></tr>`).join('')}</table>`;
        bind();
      };
      const bind = () => root.querySelectorAll('[data-mode],[data-year],[data-month]').forEach(b => b.onclick = () => {
        if (b.dataset.mode) st.mode = b.dataset.mode; if (b.dataset.year) st.year = +b.dataset.year; if (b.dataset.month) st.month = +b.dataset.month; draw();
      });
      draw();
    },
  });
})();
