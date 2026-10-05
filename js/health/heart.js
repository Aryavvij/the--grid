/* Heart & Vitals page */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats;
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

  G.registerPage('heart', {
    google: true,
    title: 'Heart & Vitals', sub: 'Resting HR · HRV · SpO2 · skin temp · breathing', ranges: [7, 30, 90],
    async render(root, { range }) {
      const all = (await G.data('daily', { limit: 90 })).slice().reverse();
      if (!all.length) { root.innerHTML = G.empty('NO HEALTH DATA YET<br>Press CONNECT GOOGLE HEALTH (top right) to start syncing.'); return; }
      const rows = all.slice(-range), prev = all.slice(-range * 2, -range), x = rows.map(r => F.short(r.date));
      const col = (k) => rows.map(r => r[k]), avg = (k) => S.avg(col(k)), pavg = (k) => S.avg(prev.map(r => r[k]));
      const last = rows.at(-1);

      const ids = ['rhr', 'hrv', 'zones', 'spo2', 'temp', 'br'].reduce((o, k) => (o[k] = G.uid(), o), {});
      root.innerHTML = `<div class="hl-grid hl-g4" id="t"></div>
        <div class="hl-grid hl-g2">
          ${G.card('RESTING HEART RATE · BPM', `<div class="hl-chart" id="${ids.rhr}"></div>`, '<span class="hl-note">SHADED = YOUR NORMAL RANGE · DOTS = OUTSIDE</span>')}
          ${G.card('HEART RATE VARIABILITY · MS', `<div class="hl-chart" id="${ids.hrv}"></div>`, '<span class="hl-note" id="hrvNote"></span>')}
        </div>
        <div class="hl-grid hl-g21">
          ${G.card('TIME IN HEART-RATE ZONES · MIN', `<div class="hl-chart" id="${ids.zones}"></div>`)}
          ${G.card('BLOOD OXYGEN · SPO2 %', `<div class="hl-chart" id="${ids.spo2}"></div>`)}
        </div>
        <div class="hl-grid hl-g2">
          ${G.card('SKIN TEMPERATURE VARIATION · °C', `<div class="hl-chart sm" id="${ids.temp}"></div>`)}
          ${G.card('BREATHING RATE · /MIN', `<div class="hl-chart sm" id="${ids.br}"></div>`)}
        </div>
        ${G.card('BASELINE COMPARISON', '<div id="base"></div>')}`;

      G.tiles(root.querySelector('#t'), [
        { label: 'RESTING HR', value: last.restingHr, unit: 'bpm', delta: pct(avg('restingHr'), pavg('restingHr')), goodWhen: 'down', spark: col('restingHr') },
        { label: 'HRV', value: last.hrvMs, unit: 'ms', delta: pct(avg('hrvMs'), pavg('hrvMs')), goodWhen: 'up', spark: col('hrvMs'), color: G.colors.teal },
        { label: 'SPO2 (AVG)', value: last.spo2Avg, unit: '%', delta: pct(avg('spo2Avg'), pavg('spo2Avg')), goodWhen: 'up', spark: col('spo2Avg'), color: G.colors.blue },
        { label: 'BREATHING', value: last.breathingRate, unit: '/min', delta: pct(avg('breathingRate'), pavg('breathingRate')), spark: col('breathingRate'), color: G.colors.purple },
      ]);

      G.line(ids.rhr, { x, y: col('restingHr'), name: 'Resting HR', unit: 'bpm' });
      G.line(ids.hrv, { x, y: col('hrvMs'), name: 'HRV', unit: 'ms', color: G.colors.teal });
      const hrvBase = S.avg(all.map(r => r.hrvMs));
      root.querySelector('#hrvNote').textContent = last.hrvMs >= hrvBase ? 'ABOVE BASELINE · GOOD RECOVERY' : 'BELOW BASELINE · GO EASIER';
      G.stacked(ids.zones, { x, unit: 'min', series: [
        { name: 'Fat burn', data: rows.map(r => r.hrZones?.fatBurn), color: G.colors.blue },
        { name: 'Cardio', data: rows.map(r => r.hrZones?.cardio), color: G.colors.orange },
        { name: 'Peak', data: rows.map(r => r.hrZones?.peak), color: G.colors.red }] });
      G.line(ids.spo2, { x, y: col('spo2Avg'), name: 'SpO2', unit: '%', ref: 95, color: G.colors.blue });
      G.bars(ids.temp, { x, y: col('skinTempDelta'), name: 'Δ °C', unit: '°C', color: G.colors.orange });
      G.line(ids.br, { x, y: col('breathingRate'), name: 'Breathing', unit: '/min', color: G.colors.purple });

      const metrics = [['Resting HR', 'restingHr', 'bpm', 0], ['HRV', 'hrvMs', 'ms', 0], ['SpO2', 'spo2Avg', '%', 1], ['Skin temp Δ', 'skinTempDelta', '°C', 1], ['Breathing', 'breathingRate', '/min', 1]];
      root.querySelector('#base').innerHTML = `<table class="hl-table"><tr><th>Metric</th><th>Today</th><th>30-day normal</th><th>Status</th></tr>${metrics.map(([n, k, u, dp]) => {
        const v = all.slice(-30).map(r => r[k]), m = S.avg(v), sd = S.sd(v), t = last[k], ok = t >= m - sd && t <= m + sd;
        return `<tr><td>${n}</td><td>${F.num(t, dp)} ${u}</td><td>${F.num(m - sd, dp)} – ${F.num(m + sd, dp)} ${u}</td><td><span class="hl-chip"><span class="dot" style="background:${ok ? 'var(--green)' : 'var(--orange)'}"></span>${ok ? 'IN RANGE' : 'WATCH'}</span></td></tr>`;
      }).join('')}</table>`;
    },
  });
})();
