/* Health overview: one headline per page, today's call, 7-day cross-source timeline. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats;

  function call(today, hrvPct, sleepMin, rhrDiff) {
    const r = today.readiness;
    const head = r == null ? 'NO READINESS YET' : r >= 75 ? 'GREEN LIGHT: HARD SESSION OK' : r >= 55 ? 'STEADY: TRAIN AS PLANNED, KEEP IT CONTROLLED' : r >= 35 ? 'EASY DAY: ZONE 2 OR MOBILITY' : 'REST DAY RECOMMENDED';
    const tag = (txt, ok) => `<span class="hl-chip"><span class="dot" style="background:${ok ? 'var(--green)' : 'var(--orange)'}"></span>${txt}</span>`;
    return { head: `${head}`, why: [
      tag(`HRV ${hrvPct >= 0 ? '+' : ''}${hrvPct.toFixed(0)}% VS BASELINE`, hrvPct >= -5),
      tag(`SLEEP ${F.hm(sleepMin)}`, sleepMin >= 420),
      tag(`RESTING HR ${rhrDiff >= 0 ? '+' : ''}${rhrDiff.toFixed(1)} BPM`, rhrDiff <= 2)].join('') };
  }

  G.registerPage('health', {
    title: 'Today', sub: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
    async render(root) {
      const all = (await G.data('daily', { limit: 90 })).slice().reverse();
      if (!all.length) { root.innerHTML = G.empty('NO HEALTH DATA YET<br>Connect Google Health to start syncing (Phase 3).'); return; }
      const sleep = (await G.data('sleep', { limit: 90 })).slice().reverse();
      const runs = await G.data('runs', { limit: 30 });
      const [targets, foodToday] = await Promise.all([G.data('targets'), G.data('foodlog', { from: F.date(new Date()), to: F.date(new Date()) })]);
      const today = all.at(-1), night = sleep.at(-1), win = all.slice(-28), wk = all.slice(-7), swk = sleep.slice(-7);
      const hrvB = S.avg(win.map(r => r.hrvMs)), rhrB = S.avg(win.map(r => r.restingHr));
      const c = call(today, ((today.hrvMs - hrvB) / hrvB) * 100, night?.minutesAsleep ?? 0, today.restingHr - rhrB);
      const eaten = Math.round(S.sum(foodToday.map(e => e.calories))), ids = { g: G.uid(), tl: G.uid() };
      const lastRun = runs[0];

      root.innerHTML = `<div class="hl-grid hl-g4">
          ${G.card('READINESS', `<div class="hl-ring" id="${ids.g}" style="height:170px"></div>`, '<span class="hl-note">GRID-CALCULATED</span>')}
          <div id="h1" style="display:contents"></div>
        </div>
        <div class="hl-card hl-call" style="margin-bottom:14px"><div class="hl-label" style="margin-bottom:8px">TODAY'S CALL</div><div class="hl-big">${c.head}</div><div class="hl-tags">${c.why}</div></div>
        <div class="hl-grid hl-g6" id="vit"></div>
        ${G.card('LAST 7 DAYS', `<div class="hl-chart" id="${ids.tl}"></div>`, '<span class="hl-note">BARS = SLEEP H · LINE = CARDIO LOAD · DOTS = RUN KM</span>')}
        <div class="hl-grid hl-g2">
          ${G.card('LAST RUN', lastRun ? `<div class="hl-tile"><div class="hl-val">${F.km(lastRun.distanceM, 2)}<span class="hl-unit">km</span></div>
            <div class="hl-delta flat">${lastRun.date} · ${F.dur(lastRun.movingSec)} · ${F.pace(lastRun.movingSec / (lastRun.distanceM / 1000))} · ${lastRun.avgHr} bpm</div>
            <div style="margin-top:12px"><button class="hl-btn pri" onclick="navigate('runs')">OPEN RUNS</button></div></div>` : G.empty('NO RUNS YET'))}
          ${G.card('GYM', `<div class="hl-empty" style="padding:18px 8px">Your split and today's session live on the Gym page.<br><br><button class="hl-btn pri" onclick="navigate('workout')">OPEN GYM</button></div>`)}
        </div>`;

      window.gridGauge(ids.g, { value: today.readiness, centerValue: today.readiness, defaultLabel: G.calc.readinessLabel(today.readiness), activeFill: today.readiness >= 55 ? '#76b372' : '#f97316' });
      const row = (k) => wk.map(r => r[k]);
      const tiles = [
        { label: 'SLEEP SCORE', value: night?.score ?? '—', unit: '/100', spark: swk.map(s => s.score) },
        { label: 'CARDIO LOAD', value: today.cardioLoad, spark: row('cardioLoad'), color: G.colors.orange },
        { label: 'CALORIES', value: F.num(eaten), unit: targets ? 'of ' + F.num(targets.calories) : 'kcal', note: targets ? `${Math.max(0, targets.calories - eaten)} LEFT` : '' },
      ];
      const h1 = root.querySelector('#h1'); h1.innerHTML = tiles.map(G.tile).map(b => b.html).join('');
      h1.querySelectorAll('.hl-spark').forEach((el, i) => { const sp = tiles.filter(t => t.spark)[i]; if (sp) G.spark(el.id || (el.id = G.uid()), sp.spark, sp.color); });
      G.tiles(root.querySelector('#vit'), [
        { label: 'RESTING HR', value: today.restingHr, unit: 'bpm', spark: row('restingHr') }, { label: 'HRV', value: today.hrvMs, unit: 'ms', spark: row('hrvMs'), color: G.colors.teal },
        { label: 'SPO2', value: today.spo2Avg, unit: '%', spark: row('spo2Avg'), color: G.colors.blue }, { label: 'SKIN TEMP', value: (today.skinTempDelta >= 0 ? '+' : '') + today.skinTempDelta, unit: '°C', spark: row('skinTempDelta'), color: G.colors.orange },
        { label: 'BREATHING', value: today.breathingRate, unit: '/min', spark: row('breathingRate'), color: G.colors.purple }, { label: 'STEPS', value: F.num(today.steps), spark: row('steps') },
      ]);

      const x = wk.map(r => F.short(r.date)), runBy = {}; runs.forEach(r => { runBy[r.date] = (runBy[r.date] || 0) + r.distanceM / 1000; });
      window.ethosChart(ids.tl).setOption({ grid: { left: 42, right: 42, top: 22, bottom: 26 }, tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: x, axisLabel: { color: 'rgba(240,240,240,0.38)', fontSize: 10 } },
        yAxis: [{ type: 'value', name: 'h', min: 0, max: 10 }, { type: 'value', name: 'load', splitLine: { show: false } }],
        series: [Object.assign(window.bkBar('#3b82f6', { count: 7 }), { name: 'Sleep h', data: wk.map(r => { const s = sleep.find(z => z.date === r.date); return s ? +(s.minutesAsleep / 60).toFixed(1) : null; }) }),
          { type: 'line', name: 'Load', yAxisIndex: 1, data: row('cardioLoad'), symbol: 'none', lineStyle: { color: '#f97316', width: 2 } },
          { type: 'scatter', name: 'Run km', yAxisIndex: 1, data: wk.map(r => (runBy[r.date] ? runBy[r.date] * 10 : null)), symbolSize: (v) => (v ? 10 + v / 4 : 0), itemStyle: { color: '#76b372' }, tooltip: { valueFormatter: (v) => (v / 10).toFixed(1) + ' km' } }] }, true);
    },
  });
})();
