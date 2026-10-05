const GRID = require('path').resolve(__dirname, '..');
const c = require(GRID + '/js/fuel/calc.js');
const a = (n, x) => { if (!x) { console.error('FAIL', n); process.exitCode = 1; } else console.log('ok', n); };
a('bmr male 72kg 175cm 21y = 1714 (hand calc)', c.bmr({ sex: 'male', kg: 72, cm: 175, age: 21 }) === 1714);
a('bmr female 60kg 165cm 30y = 1320 (hand calc)', c.bmr({ sex: 'female', kg: 60, cm: 165, age: 30 }) === 1320);
a('tdee moderate', c.tdee(1714, 'moderate') === Math.round(1714 * 1.55));
a('tdee unknown level falls back to sedentary', c.tdee(1700, 'zzz') === Math.round(1700 * 1.2));
a('fitbit-derived metrics are gone', c.readiness === undefined && c.sleepScore === undefined && c.cardioLoad === undefined);
