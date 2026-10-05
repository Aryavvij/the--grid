/* Calorie deficit maths. Pure functions (browser + node tests).
   Deficit = calories burned - calories eaten (food log). Burn is typed in by hand from the user's tracker app;
   days without an entry fall back to an estimate (the plan's TDEE), flagged as estimated. Only COMPLETE, TRUSTWORTHY days count:
   not today (still in progress), days with no food log (would fake a huge deficit), days with implausibly low intake. */
(function (root) {
  const KCAL_PER_KG = 7700, MIN_PLAUSIBLE_INTAKE = 800;
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  /** One row per date in [from, to]. intake/burn are { 'YYYY-MM-DD': kcal } maps; estimate = fallback burn (TDEE) or null.
      With useEstimate=false, days without a typed-in burn are skipped instead of estimated. */
  function buildDays({ from, to, intake = {}, burn = {}, today, estimate = null, useEstimate = true }) {
    const rows = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const i = intake[d] || 0, manual = burn[d] ?? null, est = useEstimate && estimate ? estimate : null;
      const b = manual != null ? manual : est, source = manual != null ? 'manual' : est != null ? 'estimate' : null;
      let status = 'ok';
      if (d >= today) status = 'today';
      else if (!i) status = 'nolog';
      else if (b == null) status = 'noburn';
      else if (i < MIN_PLAUSIBLE_INTAKE) status = 'check';
      rows.push({ date: d, intake: i || null, burn: b, burnSource: source, deficit: i && b != null ? Math.round(b - i) : null, status });
    }
    return rows;
  }

  /** planned = intended daily deficit (TDEE - target), or 0. */
  function summary(rows, planned = 0) {
    const ok = rows.filter(r => r.status === 'ok'), total = ok.reduce((s, r) => s + r.deficit, 0);
    let streak = 0; for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i]; if (r.status === 'today') continue; if (r.status === 'ok' && r.deficit > 0) streak++; else break; }
    const onTarget = planned > 0 ? ok.filter(r => r.deficit >= planned * 0.8).length : ok.filter(r => r.deficit > 0).length;
    const by = ok.slice().sort((a, b) => b.deficit - a.deficit);
    return { days: ok.length, estimatedDays: ok.filter(r => r.burnSource === 'estimate').length, total, avg: ok.length ? Math.round(total / ok.length) : null, kg: +(total / KCAL_PER_KG).toFixed(2), onTarget, streak, best: by[0] || null, worst: by.at(-1) || null,
      skipped: rows.filter(r => r.status !== 'ok' && r.status !== 'today').length };
  }

  /** Running total of counted days, aligned to rows (null before the first counted day). */
  function cumulative(rows) { let t = 0, started = false; return rows.map(r => { if (r.status === 'ok') { t += r.deficit; started = true; } return started ? t : null; }); }
  const predictedWeight = (startKg, cum) => cum.map(c => (c == null ? null : +(startKg - c / KCAL_PER_KG).toFixed(2)));

  /** Monday-start week buckets over counted days. */
  function weekly(rows) {
    const weeks = {};
    rows.filter(r => r.status === 'ok').forEach(r => { const d = new Date(r.date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); (weeks[k] = weeks[k] || []).push(r.deficit); });
    return Object.keys(weeks).sort().map(k => ({ week: k, days: weeks[k].length, total: weeks[k].reduce((a, b) => a + b, 0), avg: Math.round(weeks[k].reduce((a, b) => a + b, 0) / weeks[k].length) }));
  }

  /** Linear trend of weight in kg per week (least squares over dated points), or null with < 2 points / < 7 days span. */
  function weightTrend(points) {
    const p = points.filter(x => x.kg != null); if (p.length < 2) return null;
    const t0 = new Date(p[0].date + 'T12:00:00Z') / 864e5, xs = p.map(x => new Date(x.date + 'T12:00:00Z') / 864e5 - t0), ys = p.map(x => x.kg);
    if (xs.at(-1) < 6) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0); if (!den) return null;
    return +(((xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den) * 7).toFixed(2));
  }

  const api = { buildDays, summary, cumulative, predictedWeight, weekly, weightTrend, KCAL_PER_KG, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Grid = root.Grid || {}).deficit = api;
})(typeof window !== 'undefined' ? window : globalThis);
