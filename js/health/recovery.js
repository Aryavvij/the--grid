/* Recovery & Insights page */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats, C = () => G.calc;

  const bar = (label, score, note) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:10px;letter-spacing:1.2px;margin-bottom:5px"><span>${label}</span><span style="color:var(--text-muted)">${note}</span></div>
    <div style="height:6px;border-radius:3px;background:rgba(255,255,255,.07)"><div style="height:100%;width:${Math.max(3, Math.min(100, score))}%;border-radius:3px;background:${score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--orange)' : 'var(--red)'}"></div></div></div>`;

  G.registerPage('recovery', {
    google: true,
    title: 'Recovery & Insights', sub: 'Readiness · baselines · early warnings', ranges: [14, 30, 90],
    async render(root, { range }) {
      const all = (await G.data('daily', { limit: 90 })).slice().reverse();
      const sleep = (await G.data('sleep', { limit: 90 })).slice().reverse();
      if (!all.length) { root.innerHTML = G.empty('NO RECOVERY DATA YET<br>Press CONNECT GOOGLE HEALTH (top right). Your data refreshes once a day.'); return; }
      const today = all.at(-1), win = all.slice(-28), rows = all.slice(-range), x = rows.map(r => F.short(r.date));
      const hrvB = S.avg(win.map(r => r.hrvMs)), rhrB = S.avg(win.map(r => r.restingHr)), ss = sleep.at(-1)?.score, ratio = C().loadRatio(all.map(r => r.cardioLoad));
      const ids = ['gauge', 'hist', 'hrv', 'rhr', 'spo2', 'tmp', 'over'].reduce((o, k) => (o[k] = G.uid(), o), {});
      const hrvPct = ((today.hrvMs - hrvB) / hrvB) * 100, rhrDiff = today.restingHr - rhrB;

      // early warning: RHR up 3+ bpm and HRV down 10%+ for 3 straight days
      const last3 = all.slice(-3), warn = last3.length === 3 && last3.every(r => r.restingHr - rhrB >= 3 && ((r.hrvMs - hrvB) / hrvB) * 100 <= -10);

      root.innerHTML = `<div class="hl-grid hl-g3">
          ${G.card('READINESS', `<div class="hl-ring" id="${ids.gauge}" style="height:220px"></div>`, '<span class="hl-note">GRID-CALCULATED</span>')}
          ${G.card('WHAT\'S DRIVING IT', `${bar('HRV vs baseline', 50 + hrvPct * 2.5, (hrvPct >= 0 ? '+' : '') + hrvPct.toFixed(0) + '%')}
            ${bar('Resting HR vs baseline', 50 - rhrDiff * 8, (rhrDiff >= 0 ? '+' : '') + rhrDiff.toFixed(1) + ' bpm')}
            ${bar('Sleep', ss ?? 0, ss != null ? ss + '/100' : '—')}
            ${bar('Training load balance', ratio ? 100 - Math.abs(ratio - 1) * 120 : 0, ratio ? 'ratio ' + ratio.toFixed(2) : '—')}`)}
          ${G.card(warn ? 'EARLY WARNING' : 'ALL CLEAR', `<div class="hl-big" style="font-size:12px;line-height:1.7;color:${warn ? 'var(--orange)' : 'var(--text-dim)'}">${warn
            ? 'Resting HR is up 3+ bpm and HRV is down 10%+ for 3 days in a row. Possible fatigue or illness. Consider a rest day.'
            : 'No vitals are drifting from your baseline. Nothing here suggests fatigue or illness.'}</div>`)}
        </div>
        <div class="hl-grid hl-g2">
          ${G.card('READINESS HISTORY', `<div class="hl-chart" id="${ids.hist}"></div>`)}
          ${G.card('RECOVERY VS TRAINING', `<div class="hl-chart" id="${ids.over}"></div>`, '<span class="hl-note">LINE = READINESS · BARS = LOAD</span>')}
        </div>
        <div class="hl-grid hl-g2">
          ${G.card('HRV · MS', `<div class="hl-chart sm" id="${ids.hrv}"></div>`)}
          ${G.card('RESTING HR · BPM', `<div class="hl-chart sm" id="${ids.rhr}"></div>`)}
          ${G.card('SPO2 · %', `<div class="hl-chart sm" id="${ids.spo2}"></div>`)}
          ${G.card('SKIN TEMP Δ · °C', `<div class="hl-chart sm" id="${ids.tmp}"></div>`)}
        </div>`;

      window.gridGauge(ids.gauge, { value: today.readiness, centerValue: today.readiness, defaultLabel: C().readinessLabel(today.readiness), activeFill: today.readiness >= 55 ? '#76b372' : '#f97316' });
      G.line(ids.hist, { x, y: rows.map(r => r.readiness), name: 'Readiness', band: false });
      const o = window.ethosChart(ids.over);
      o.setOption({ grid: { left: 42, right: 42, top: 22, bottom: 26 }, tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: x, axisLabel: { color: 'rgba(240,240,240,0.38)', fontSize: 10, interval: Math.max(0, Math.ceil(x.length / 8) - 1) } },
        yAxis: [{ type: 'value', min: 0, max: 100 }, { type: 'value', splitLine: { show: false } }],
        series: [Object.assign(window.bkBar(G.colors.orange, { count: x.length }), { name: 'Load', yAxisIndex: 1, data: rows.map(r => r.cardioLoad), itemStyle: { color: 'rgba(249,115,22,0.35)' } }),
          { type: 'line', name: 'Readiness', data: rows.map(r => r.readiness), symbol: 'none', lineStyle: { color: '#76b372', width: 2 } }] }, true);
      G.line(ids.hrv, { x, y: rows.map(r => r.hrvMs), color: G.colors.teal });
      G.line(ids.rhr, { x, y: rows.map(r => r.restingHr) });
      G.line(ids.spo2, { x, y: rows.map(r => r.spo2Avg), color: G.colors.blue, ref: 95 });
      G.line(ids.tmp, { x, y: rows.map(r => r.skinTempDelta), color: G.colors.orange });
    },
  });
})();
