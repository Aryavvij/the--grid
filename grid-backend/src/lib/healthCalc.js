/* COPY of js/health/calc.js (the backend deploys separately and cannot import the frontend). Keep in sync.
   GRID-calculated metrics, used when Google Health does not expose them
   (Cardio Load, Readiness, Sleep Score were not documented in the API; Phase 1 confirms).
   Pure functions, no DOM: also loaded by node for tests. */
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = (a) => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  const calc = {
    /** Cardio load from minutes in HR zones (fat burn x1, cardio x2, peak x3). */
    cardioLoad(z) { return z ? Math.round((z.fatBurn || 0) * 1 + (z.cardio || 0) * 2 + (z.peak || 0) * 3) : null; },

    /** Sleep score 0-100: duration (50), deep+REM share (30), efficiency (20). */
    sleepScore(s) {
      if (!s || !s.minutesAsleep) return null;
      const dur = clamp(s.minutesAsleep / 480, 0, 1) * 50;
      const restorative = (((s.deepMin || 0) + (s.remMin || 0)) / s.minutesAsleep);
      const rest = clamp(restorative / 0.40, 0, 1) * 30;            // ~40% deep+REM is a strong night
      const eff = clamp(((s.efficiency || 85) - 70) / 25, 0, 1) * 20;
      return Math.round(dur + rest + eff);
    },

    /** Readiness 0-100 from HRV vs baseline, resting HR vs baseline, sleep score and training-load balance.
        Each input is optional; missing ones are skipped and weights renormalised. */
    readiness(x) {
      const parts = [];
      if (x.hrv != null && x.hrvBase) parts.push([0.35, clamp(50 + ((x.hrv - x.hrvBase) / x.hrvBase) * 250, 0, 100)]);
      if (x.rhr != null && x.rhrBase) parts.push([0.25, clamp(50 - (x.rhr - x.rhrBase) * 8, 0, 100)]);
      if (x.sleepScore != null)       parts.push([0.25, clamp(x.sleepScore, 0, 100)]);
      if (x.loadRatio != null)        parts.push([0.15, clamp(100 - Math.abs(x.loadRatio - 1) * 120, 0, 100)]);
      if (!parts.length) return null;
      const w = parts.reduce((s, p) => s + p[0], 0);
      return Math.round(parts.reduce((s, p) => s + p[0] * p[1], 0) / w);
    },

    /** Acute (7d) vs chronic (28d) load ratio. loads = oldest..newest daily loads. */
    loadRatio(loads) {
      const a = mean(loads.slice(-7)), c = mean(loads.slice(-28));
      return a != null && c ? a / c : null;
    },

    readinessLabel(r) { return r == null ? 'NO DATA' : r >= 75 ? 'PRIMED' : r >= 55 ? 'STEADY' : r >= 35 ? 'TAKE IT EASY' : 'REST'; },

    /** Mifflin-St Jeor BMR + standard activity multipliers. */
    bmr({ sex, kg, cm, age }) { return Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)); },
    tdee(bmr, level) { return Math.round(bmr * ({ sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, athlete: 1.9 }[level] || 1.2)); },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = calc;
  else (root.Grid = root.Grid || {}).calc = calc;
})(typeof window !== 'undefined' ? window : globalThis);
