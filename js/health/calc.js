/* GRID-calculated metrics, used when Google Health does not expose them
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

    /**
     * Daily calorie + macro plan. Standards only: Mifflin-St Jeor BMR, activity multipliers, ~3,500 kcal per lb,
     * protein 0.8-1.0 g/lb (1.0 when losing or athlete), fat 0.35 g/lb, carbs = remaining calories.
     * Floors: never below 1,500 kcal (male) / 1,200 kcal (female). Returns { ok:false, error } on bad input.
     * in: { sex:'male'|'female', age, kg, cm, level, goal:'lose'|'maintain'|'gain', pace:'gentle'|'steady'|'aggressive', goalKg }
     */
    plan(i) {
      const bad = (error) => ({ ok: false, error });
      if (!(i.age >= 14 && i.age <= 90)) return bad('Age must be 14 to 90');
      if (!(i.kg >= 30 && i.kg <= 250)) return bad('Weight must be 30 to 250 kg');
      if (!(i.cm >= 120 && i.cm <= 230)) return bad('Height must be 120 to 230 cm');
      if (i.sex !== 'male' && i.sex !== 'female') return bad('Choose a sex for the metabolic maths');
      if (i.goal !== 'maintain') {
        if (!(i.goalKg >= 30 && i.goalKg <= 250)) return bad('Enter a goal weight');
        if (i.goal === 'lose' && i.goalKg >= i.kg) return bad('Goal weight must be below current weight to lose');
        if (i.goal === 'gain' && i.goalKg <= i.kg) return bad('Goal weight must be above current weight to gain');
      }
      const bmr = calc.bmr(i), tdee = calc.tdee(bmr, i.level), lb = i.kg * 2.20462, floor = i.sex === 'male' ? 1500 : 1200;
      const pace = { gentle: 0, steady: 1, aggressive: 2 }[i.pace] ?? 1;
      const adj = i.goal === 'lose' ? -[250, 500, 750][pace] : i.goal === 'gain' ? [250, 325, 400][pace] : 0;
      let calories = tdee + adj, floored = false;
      if (calories < floor) { calories = floor; floored = true; }
      const protein = Math.round(lb * (i.goal === 'lose' || i.level === 'athlete' ? 1.0 : i.goal === 'gain' ? 0.9 : 0.8));
      const fat = Math.round(lb * 0.35);
      const carbsRaw = (calories - protein * 4 - fat * 9) / 4, carbs = Math.max(0, Math.round(carbsRaw));
      const oz = { sedentary: 0.5, light: 0.6, moderate: 0.7, very: 0.85, athlete: 1.0 }[i.level] || 0.6;
      const waterMl = Math.round((lb * oz * 29.5735) / 50) * 50;
      const gap = (tdee - calories) * 7, weeklyLb = gap / 3500;                  // negative when gaining
      let weeks = null, weeklyKg = null;
      if (i.goal !== 'maintain' && Math.abs(weeklyLb) > 0.01) { weeklyKg = +(Math.abs(weeklyLb) / 2.20462).toFixed(2); weeks = Math.round(Math.abs(i.kg - i.goalKg) * 2.20462 / Math.abs(weeklyLb)); }
      const notes = [];
      if (floored) notes.push(`Calories raised to the safe minimum of ${floor}. Your goal pace is slower than requested.`);
      if (carbsRaw < 0) notes.push('Protein and fat targets exceed your calories; carbs set to 0. Consider a gentler pace.');
      if (i.goal === 'lose' && weeklyKg && weeklyKg > i.kg * 0.01) notes.push('This pace is over 1% of bodyweight per week; consider "steady".');
      return { ok: true, bmr, tdee, calories, adjust: calories - tdee, protein, carbs, fat, waterMl, weeklyKg, weeks, floored, notes };
    },

    /** Mifflin-St Jeor BMR + standard activity multipliers. */
    bmr({ sex, kg, cm, age }) { return Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)); },
    tdee(bmr, level) { return Math.round(bmr * ({ sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, athlete: 1.9 }[level] || 1.2)); },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = calc;
  else (root.Grid = root.Grid || {}).calc = calc;
})(typeof window !== 'undefined' ? window : globalThis);
