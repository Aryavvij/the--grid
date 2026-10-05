/* Sleep page */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats;
  const STAGE = { awake: ['Awake', '#f97316', 3], rem: ['REM', '#9b59b6', 2], light: ['Light', '#3b82f6', 1], deep: ['Deep', '#14b8a6', 0] };

  function hypnogram(el, night) {
    const c = window.ethosChart(el); if (!c || !night.stages) return;
    const t0 = new Date(night.startTime).getTime();
    const data = night.stages.map(s => ({ name: s.type, value: [STAGE[s.type][2], new Date(s.start).getTime(), new Date(s.end).getTime()], itemStyle: { color: STAGE[s.type][1] } }));
    c.setOption({
      grid: { left: 54, right: 14, top: 10, bottom: 26 },
      tooltip: { formatter: (p) => `${STAGE[p.name][0]}<br>${new Date(p.value[1]).toTimeString().slice(0, 5)} – ${new Date(p.value[2]).toTimeString().slice(0, 5)}` },
      xAxis: { type: 'time', min: t0, max: new Date(night.endTime).getTime(), axisLabel: { color: 'rgba(240,240,240,0.38)', fontSize: 10, formatter: (v) => new Date(v).toTimeString().slice(0, 5) } },
      yAxis: { type: 'category', data: ['Deep', 'Light', 'REM', 'Awake'], axisLabel: { color: 'rgba(240,240,240,0.38)', fontSize: 10 }, splitLine: { show: false } },
      series: [{ type: 'custom', data, encode: { x: [1, 2], y: 0 },
        renderItem: (params, api) => {
          const y = api.coord([0, api.value(0)])[1], a = api.coord([api.value(1), 0])[0], b = api.coord([api.value(2), 0])[0], h = api.size([0, 1])[1] * 0.7;
          return { type: 'rect', shape: { x: a, y: y - h / 2, width: Math.max(1, b - a), height: h, r: 2 }, style: api.style() };
        } }],
    }, true);
    c.resize();
  }

  G.registerPage('sleep', {
    google: true,
    title: 'Sleep', sub: 'Stages · score · consistency · sleeping heart rate', ranges: [7, 30, 90],
    async render(root, { range }) {
      const all = (await G.data('sleep', { limit: 90 })).slice().reverse();
      if (!all.length) { root.innerHTML = G.empty('NO SLEEP DATA YET<br>Press CONNECT GOOGLE HEALTH (top right). Your data refreshes once a day.'); return; }
      const rows = all.slice(-range), prev = all.slice(-range * 2, -range), night = all.at(-1), x = rows.map(r => F.short(r.date));
      const col = (k) => rows.map(r => r[k]), pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
      const ids = ['hyp', 'dur', 'score', 'cons', 'tbl'].reduce((o, k) => (o[k] = G.uid(), o), {});
      const tot = night.minutesAsleep, share = (m) => Math.round((m / (tot + (night.minutesAwake || 0))) * 100);

      root.innerHTML = `<div class="hl-grid hl-g4" id="t"></div>
        <div class="hl-grid hl-g21">
          ${G.card('LAST NIGHT · STAGES', `<div class="hl-chart sm" id="${ids.hyp}"></div>`, `<span class="hl-note">${new Date(night.startTime).toTimeString().slice(0, 5)} → ${new Date(night.endTime).toTimeString().slice(0, 5)}</span>`)}
          ${G.card('STAGE BREAKDOWN', `<table class="hl-table">${[['deep', night.deepMin], ['rem', night.remMin], ['light', night.lightMin], ['awake', night.minutesAwake]].map(([k, m]) =>
            `<tr><td><span class="hl-code" style="color:${STAGE[k][1]};border-color:${STAGE[k][1]}">${STAGE[k][0]}</span></td><td>${F.hm(m)}</td><td>${share(m)}%</td></tr>`).join('')}</table>`)}
        </div>
        <div class="hl-grid hl-g2">
          ${G.card('SLEEP DURATION · H (GOAL 8)', `<div class="hl-chart" id="${ids.dur}"></div>`)}
          ${G.card('SLEEP SCORE', `<div class="hl-chart" id="${ids.score}"></div>`, '<span class="hl-note">GRID-CALCULATED</span>')}
        </div>
        ${G.card('BEDTIME CONSISTENCY · CLOCK TIME', `<div class="hl-chart sm" id="${ids.cons}"></div>`, '<span class="hl-note" id="consNote"></span>')}
        ${G.card('HISTORY', `<div id="${ids.tbl}"></div>`)}`;

      G.tiles(root.querySelector('#t'), [
        { label: 'SLEEP SCORE', value: night.score, unit: '/100', delta: pct(S.avg(col('score')), S.avg(prev.map(r => r.score))), goodWhen: 'up', spark: col('score') },
        { label: 'TIME ASLEEP', value: F.hm(night.minutesAsleep), delta: pct(S.avg(col('minutesAsleep')), S.avg(prev.map(r => r.minutesAsleep))), goodWhen: 'up', spark: col('minutesAsleep'), color: G.colors.blue },
        { label: 'EFFICIENCY', value: night.efficiency, unit: '%', spark: col('efficiency'), color: G.colors.teal },
        { label: 'SLEEPING HR', value: night.sleepingHr, unit: 'bpm', goodWhen: 'down', spark: col('sleepingHr'), color: G.colors.pink },
      ]);
      hypnogram(ids.hyp, night);
      G.bars(ids.dur, { x, y: rows.map(r => +(r.minutesAsleep / 60).toFixed(2)), ref: 8, refLabel: 'GOAL 8H', unit: 'h', color: G.colors.blue });
      G.line(ids.score, { x, y: col('score'), name: 'Score', unit: '' });

      // bedtime as hours after 18:00 so after-midnight sits above before-midnight
      const bed = rows.map(r => { const d = new Date(r.startTime); let h = d.getHours() + d.getMinutes() / 60; if (h < 18) h += 24; return +h.toFixed(2); });
      const c = window.ethosChart(ids.cons);
      c.setOption({ grid: { left: 54, right: 14, top: 14, bottom: 26 }, tooltip: { trigger: 'axis', formatter: (p) => { const v = p[0].value % 24, h = Math.floor(v), m = Math.round((v - h) * 60); return `${p[0].name}<br>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; } },
        xAxis: { type: 'category', data: x, axisLabel: { color: 'rgba(240,240,240,0.38)', fontSize: 10, interval: Math.max(0, Math.ceil(x.length / 8) - 1) } },
        yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v) => String(Math.floor(v % 24)).padStart(2, '0') + ':00', color: 'rgba(240,240,240,0.38)', fontSize: 10 } },
        series: [{ type: 'line', data: bed, symbolSize: 5, lineStyle: { color: G.colors.purple, width: 1 }, itemStyle: { color: G.colors.purple } }] }, true);
      const sd = S.sd(bed) * 60;
      root.querySelector('#consNote').textContent = `±${Math.round(sd)} MIN BEDTIME SPREAD · ${sd < 30 ? 'CONSISTENT' : sd < 50 ? 'FAIRLY REGULAR' : 'IRREGULAR'}`;

      const tbl = root.querySelector('#' + ids.tbl);
      tbl.innerHTML = `<table class="hl-table"><tr><th>Date</th><th>Score</th><th>Asleep</th><th>Deep</th><th>REM</th><th>Awake</th></tr>${rows.slice(-10).reverse().map(r =>
        `<tr style="cursor:pointer" data-d="${r.date}"><td>${r.date}</td><td>${r.score}</td><td>${F.hm(r.minutesAsleep)}</td><td>${r.deepMin}m</td><td>${r.remMin}m</td><td>${r.minutesAwake}m</td></tr>`).join('')}</table>`;
      tbl.querySelectorAll('tr[data-d]').forEach(tr => tr.onclick = () => hypnogram(ids.hyp, rows.find(r => r.date === tr.dataset.d)));
    },
  });
})();
