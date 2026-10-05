/* Activity & Load page */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats;
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

  G.registerPage('activity', {
    title: 'Activity & Load', sub: 'Steps · cardio load · active zone minutes · calories', ranges: [7, 30, 90],
    async render(root, { range }) {
      const all = (await G.data('daily', { limit: 90 })).slice().reverse();
      if (!all.length) { root.innerHTML = G.empty('NO ACTIVITY DATA YET<br>Connect Google Health to start syncing (Phase 3).'); return; }
      const rows = all.slice(-range), prev = all.slice(-range * 2, -range), today = all.at(-1), x = rows.map(r => F.short(r.date));
      const col = (k) => rows.map(r => r[k]);
      const ids = ['steps', 'load', 'azm', 'ex'].reduce((o, k) => (o[k] = G.uid(), o), {});
      const chronic = S.avg(all.slice(-28).map(r => r.cardioLoad));
      const ratio = G.calc.loadRatio(all.map(r => r.cardioLoad));

      root.innerHTML = `<div class="hl-grid hl-g4" id="t"></div>
        <div class="hl-grid hl-g2">
          ${G.card('STEPS', `<div class="hl-chart" id="${ids.steps}"></div>`, '<span class="hl-note">DASHED = 10,000 GOAL</span>')}
          ${G.card('CARDIO LOAD', `<div class="hl-chart" id="${ids.load}"></div>`, `<span class="hl-note">GRID-CALCULATED · ACUTE:CHRONIC ${ratio ? ratio.toFixed(2) : '—'} · ${ratio == null ? '' : ratio > 1.3 ? 'OVERREACHING' : ratio < 0.8 ? 'UNDERTRAINING' : 'BALANCED'}</span>`)}
        </div>
        <div class="hl-grid hl-g21">
          ${G.card('ACTIVE ZONE MINUTES', `<div class="hl-chart sm" id="${ids.azm}"></div>`, '<span class="hl-note">DASHED = 150 / WEEK</span>')}
          ${G.card('TODAY', `<table class="hl-table">
            <tr><td>Sedentary</td><td>${F.hm(today.sedentaryMin)}</td></tr>
            <tr><td>Active energy</td><td>${F.num(today.caloriesActive)} kcal</td></tr>
            <tr><td>Resting energy</td><td>${F.num(today.caloriesTotal - today.caloriesActive)} kcal</td></tr>
            <tr><td>Distance</td><td>${F.km(today.distanceM, 2)} km</td></tr></table>`)}
        </div>
        ${G.card('DETECTED WORKOUTS', `<div id="${ids.ex}"></div>`)}`;

      G.tiles(root.querySelector('#t'), [
        { label: 'STEPS', value: F.num(today.steps), delta: pct(S.avg(col('steps')), S.avg(prev.map(r => r.steps))), goodWhen: 'up', spark: col('steps') },
        { label: 'DISTANCE', value: F.km(today.distanceM), unit: 'km', spark: col('distanceM'), color: G.colors.blue },
        { label: 'CALORIES BURNED', value: F.num(today.caloriesTotal), unit: 'kcal', spark: col('caloriesTotal'), color: G.colors.orange },
        { label: 'ACTIVE ZONE MIN', value: today.azmMinutes, unit: 'min', delta: pct(S.avg(col('azmMinutes')), S.avg(prev.map(r => r.azmMinutes))), goodWhen: 'up', spark: col('azmMinutes'), color: G.colors.teal },
      ]);
      G.bars(ids.steps, { x, y: col('steps'), ref: 10000, refLabel: '10K' });
      G.bars(ids.load, { x, y: col('cardioLoad'), color: G.colors.orange, band: [chronic * 0.8, chronic * 1.3] });

      // weekly AZM
      const weeks = []; for (let i = all.length; i > 0; i -= 7) weeks.unshift(all.slice(Math.max(0, i - 7), i));
      G.bars(ids.azm, { x: weeks.map((w, i) => 'W' + (i + 1)), y: weeks.map(w => S.sum(w.map(r => r.azmMinutes))), ref: 150, refLabel: '150', color: G.colors.teal });

      const runs = (await G.data('runs', { from: rows[0].date })).slice(0, 8);
      root.querySelector('#' + ids.ex).innerHTML = runs.length ? `<table class="hl-table"><tr><th>Date</th><th>Type</th><th>Distance</th><th>Time</th><th>Avg HR</th><th>Calories</th></tr>${runs.map(r =>
        `<tr><td>${r.date}</td><td>Run</td><td>${F.km(r.distanceM, 2)} km</td><td>${F.dur(r.movingSec)}</td><td>${r.avgHr || '—'}</td><td>${r.calories || '—'}</td></tr>`).join('')}</table>` : G.empty('NO WORKOUTS IN THIS RANGE');
    },
  });
})();
