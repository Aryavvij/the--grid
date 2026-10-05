/* Calorie and macro plan maths (Mifflin-St Jeor BMR, activity multipliers, safe floors).
   Pure functions, no DOM: also loaded by node for tests. */
(function (root) {
  const calc = {
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
