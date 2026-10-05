/* Shared health UI: stat tile, sparkline, line/bar/stacked/heatmap charts.
   Built on the app's existing ECharts 'ethos' theme (window.ethosChart, bkBar). */
(function () {
  const G = window.Grid;
  const GREEN = '#76b372', TEXT_MUT = 'rgba(240,240,240,0.38)';
  const COL = { green: GREEN, blue: '#3b82f6', teal: '#14b8a6', orange: '#f97316', purple: '#9b59b6', red: '#ef4444', pink: '#ff4d8f' };
  G.colors = COL;

  let uid = 0;
  const nextId = () => 'hlc' + (++uid);
  G.uid = nextId;

  /** Tile HTML. goodWhen: 'up' | 'down' decides the delta colour (lower resting HR is good). */
  G.tile = (o) => {
    const id = o.spark ? nextId() : null;
    let delta = '';
    if (o.delta != null && isFinite(o.delta)) {
      const up = o.delta > 0, good = o.goodWhen === 'down' ? !up : o.goodWhen === 'up' ? up : null;
      const cls = Math.abs(o.delta) < 0.5 ? 'flat' : good === null ? 'flat' : good ? 'good' : 'bad';
      delta = `<div class="hl-delta ${cls}">${up ? '▲' : '▼'} ${Math.abs(o.delta).toFixed(1)}% ${o.vs || 'vs prev'}</div>`;
    }
    return { id, html: `<div class="hl-card hl-tile">
      <div class="hl-card-h"><span class="hl-label">${o.label}</span></div>
      <div class="hl-val">${o.value}<span class="hl-unit">${o.unit || ''}</span></div>${delta}
      ${id ? `<div class="hl-spark" id="${id}"></div>` : ''}${o.note ? `<div class="hl-note" style="margin-top:6px">${o.note}</div>` : ''}</div>` };
  };

  /** Render a row of tiles into `el`, then draw sparklines. */
  G.tiles = (el, defs) => {
    const built = defs.map(G.tile);
    el.innerHTML = built.map(b => b.html).join('');
    built.forEach((b, i) => { if (b.id && defs[i].spark) G.spark(b.id, defs[i].spark, defs[i].color); });
  };

  G.spark = (elOrId, data, color) => {
    const c = window.ethosChart(elOrId); if (!c) return;
    c.setOption({
      grid: { left: 0, right: 0, top: 2, bottom: 2 }, xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
      yAxis: { type: 'value', show: false, scale: true }, tooltip: { show: false },
      series: [Object.assign(window.bkArea(color || GREEN, { fillOpacity: 0.25 }), { data })],
    });
  };

  const baseAxes = (x, yName) => ({
    grid: { left: 42, right: 14, top: 22, bottom: 26 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: x, axisLabel: { color: TEXT_MUT, fontSize: 10, interval: Math.max(0, Math.ceil(x.length / 8) - 1) } },
    yAxis: { type: 'value', scale: true, name: yName || '', nameTextStyle: { color: TEXT_MUT, fontSize: 9 } },
  });

  /** Line with an optional shaded baseline band (mean ± 1 SD) and flagged out-of-band points. */
  G.line = (el, o) => {
    const c = window.ethosChart(el); if (!c) return;
    const vals = o.y.filter(v => v != null), m = G.stats.avg(vals), sd = G.stats.sd(vals);
    const lo = m - sd, hi = m + sd, col = o.color || GREEN;
    const series = [Object.assign(window.bkArea(col, { fillOpacity: 0.18 }), { name: o.name || '', data: o.y, connectNulls: true })];
    if (o.band !== false && vals.length > 4) {
      series[0].markArea = { silent: true, itemStyle: { color: 'rgba(255,255,255,0.045)' }, data: [[{ yAxis: lo }, { yAxis: hi }]] };
      series[0].markPoint = { symbolSize: 7, itemStyle: { color: COL.orange }, label: { show: false },
        data: o.y.map((v, i) => (v != null && (v < lo || v > hi) ? { coord: [i, v] } : null)).filter(Boolean) };
    }
    if (o.ref != null) series[0].markLine = { silent: true, symbol: 'none', lineStyle: { color: TEXT_MUT, type: 'dashed' }, data: [{ yAxis: o.ref }], label: { color: TEXT_MUT, fontSize: 9 } };
    c.setOption(Object.assign(baseAxes(o.x, o.unit), { series }), true);
    c.resize(); return c;
  };

  G.bars = (el, o) => {
    const c = window.ethosChart(el); if (!c) return;
    const s = Object.assign(window.bkBar(o.color || GREEN, { count: o.y.length }), { name: o.name || '', data: o.y });
    if (o.ref != null) s.markLine = { silent: true, symbol: 'none', lineStyle: { color: COL.orange, type: 'dashed' }, data: [{ yAxis: o.ref }], label: { color: TEXT_MUT, fontSize: 9, formatter: o.refLabel || '{c}' } };
    if (o.band) s.markArea = { silent: true, itemStyle: { color: 'rgba(118,179,114,0.08)' }, data: [[{ yAxis: o.band[0] }, { yAxis: o.band[1] }]] };
    const ax = baseAxes(o.x, o.unit); ax.yAxis.scale = false;                       // bars always start at zero
    c.setOption(Object.assign(ax, { series: [s] }), true);
    c.resize(); return c;
  };

  /** Stacked bars: series = [{ name, data, color }]. */
  G.stacked = (el, o) => {
    const c = window.ethosChart(el); if (!c) return;
    c.setOption(Object.assign(baseAxes(o.x, o.unit), {
      legend: { top: 0, right: 0 }, grid: { left: 42, right: 14, top: 32, bottom: 26 },
      series: o.series.map(s => ({ type: 'bar', stack: 't', name: s.name, data: s.data, itemStyle: { color: s.color }, barMaxWidth: 26 })),
    }), true);
    c.resize(); return c;
  };

  /** Calendar-style heatmap by week x weekday. days = [{ date:'YYYY-MM-DD', v:number }] */
  G.heat = (el, o) => {
    const c = window.ethosChart(el); if (!c) return;
    const max = Math.max(1, ...o.days.map(d => d.v));
    c.setOption({
      tooltip: { formatter: (p) => p.value[0] + '<br>' + (p.value[1] ? p.value[1].toFixed(1) + (o.unit || '') : 'rest') },
      visualMap: { show: false, min: 0, max, inRange: { color: ['#172619', '#3b6839', '#76b372', '#a5f79e'] } },
      calendar: { range: o.range, cellSize: ['auto', 14], top: 22, left: 28, right: 8, itemStyle: { color: '#141414', borderColor: '#0f0f0f', borderWidth: 2 },
        splitLine: { show: false }, yearLabel: { show: false }, dayLabel: { color: TEXT_MUT, fontSize: 9, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] }, monthLabel: { color: TEXT_MUT, fontSize: 9 } },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: o.days.map(d => [d.date, d.v]) }],
    }, true);
    c.resize(); return c;
  };

  /** Two-up helper so pages can write cards tersely. */
  G.card = (title, inner, extra) => `<div class="hl-card"><div class="hl-card-h"><span class="hl-label">${title}</span>${extra || ''}</div>${inner}</div>`;
  G.chartBox = (cls) => { const id = nextId(); return { id, html: `<div class="hl-chart ${cls || ''}" id="${id}"></div>` }; };
  G.empty = (msg) => `<div class="hl-empty">${msg}</div>`;
})();
