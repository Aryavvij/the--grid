const GRID = require('path').resolve(__dirname, '..');
const c = require(GRID + '/js/fuel/calc.js');
const t = (n, ok, x) => { console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : x); if (!ok) process.exitCode = 1; };
const base = { sex: 'male', age: 21, kg: 72, cm: 175, level: 'moderate', goal: 'lose', pace: 'steady', goalKg: 68 };
let p = c.plan(base);
// hand calc: BMR 1714; TDEE 1714*1.55 = 2657 (2656.7); cal 2157; lb 158.73; protein 159; fat 56 (55.56); carbs (2157-636-504)/4 = 254.25
t('BMR 1714 / TDEE 2657', p.bmr === 1714 && p.tdee === 2657, JSON.stringify(p));
t('lose steady = TDEE - 500', p.calories === 2157 && p.adjust === -500);
t('protein 1.0 g/lb when losing = 159', p.protein === 159, p.protein);
t('fat 0.35 g/lb = 56', p.fat === 56, p.fat);
t('carbs fill the rest = 254', p.carbs === 254, p.carbs);
t('macro kcal add up to target (+-10)', Math.abs(p.protein * 4 + p.carbs * 4 + p.fat * 9 - p.calories) <= 10);
t('timeline: 500/day = 1 lb/wk -> 4 kg = 8.8 lb -> 9 weeks', p.weeks === 9 && p.weeklyKg === 0.45, JSON.stringify([p.weeks, p.weeklyKg]));
t('water ~ 0.7 oz/lb = 3.3 L', p.waterMl >= 3200 && p.waterMl <= 3400, p.waterMl);
// floors
p = c.plan({ sex: 'female', age: 30, kg: 55, cm: 160, level: 'sedentary', goal: 'lose', pace: 'aggressive', goalKg: 50 });
t('female floor 1200 enforced + note + slower timeline', p.calories === 1200 && p.floored && p.notes.some(n => /1200/.test(n)), JSON.stringify(p));
p = c.plan({ sex: 'male', age: 45, kg: 60, cm: 165, level: 'sedentary', goal: 'lose', pace: 'aggressive', goalKg: 55 });
t('male floor 1500 enforced', p.calories === 1500 && p.floored, p.calories);
// maintain / gain
p = c.plan({ ...base, goal: 'maintain' });
t('maintain = TDEE, 0.8 g/lb protein, no timeline', p.calories === 2657 && p.protein === Math.round(72 * 2.20462 * 0.8) && p.weeks === null);
p = c.plan({ ...base, goal: 'gain', goalKg: 76, pace: 'gentle' });
t('gain gentle = TDEE + 250, 0.9 g/lb, timeline > 0', p.calories === 2907 && p.protein === Math.round(72 * 2.20462 * 0.9) && p.weeks > 0, JSON.stringify(p));
p = c.plan({ ...base, goal: 'gain', goalKg: 76, pace: 'steady' }); t('gain steady = +325', p.adjust === 325);
p = c.plan({ ...base, level: 'athlete', goal: 'maintain' }); t('athlete uses 1.0 g/lb protein', p.protein === Math.round(72 * 2.20462 * 1.0));
// validation
t('rejects bad age', !c.plan({ ...base, age: 5 }).ok);
t('rejects bad weight', !c.plan({ ...base, kg: 400 }).ok);
t('rejects bad height', !c.plan({ ...base, cm: 50 }).ok);
t('rejects missing sex', !c.plan({ ...base, sex: '' }).ok);
t('lose with higher goal rejected', /below current/.test(c.plan({ ...base, goalKg: 80 }).error));
t('gain with lower goal rejected', /above current/.test(c.plan({ ...base, goal: 'gain', goalKg: 60 }).error));
t('lose with no goal weight rejected', !c.plan({ ...base, goalKg: undefined }).ok);
t('aggressive >1%/wk warns on a light person', c.plan({ ...base, kg: 60, goalKg: 55, pace: 'aggressive', level: 'athlete' }).notes.some(n => /1%/.test(n)));
