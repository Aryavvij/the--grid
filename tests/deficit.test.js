const GRID = require('path').resolve(__dirname, '..');
const D = require(GRID + '/js/fuel/deficit-calc.js');
const t = (n, ok, x) => { console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : x); if (!ok) process.exitCode = 1; };
const today = '2026-10-08';
const intake = { '2026-10-01': 2000, '2026-10-02': 2100, '2026-10-03': 0, '2026-10-04': 2200, '2026-10-05': 600, '2026-10-06': 1900, '2026-10-07': 2300, '2026-10-08': 900 };
const burn   = { '2026-10-01': 2600, '2026-10-02': 2500, '2026-10-03': 2400, '2026-10-04': 2800, '2026-10-05': 2500, '2026-10-06': 2700, '2026-10-07': 2200, '2026-10-08': 1200 };
const rows = D.buildDays({ from: '2026-10-01', to: '2026-10-08', intake, burn, today });
const st = Object.fromEntries(rows.map(r => [r.date, r.status]));
t('8 rows', rows.length === 8);
t('normal day counted: 2600-2000 = 600', rows[0].status === 'ok' && rows[0].deficit === 600);
t('no food log -> excluded (not a fake 2400 deficit)', st['2026-10-03'] === 'nolog' && rows[2].deficit === null);
t('intake under 800 -> flagged, excluded', st['2026-10-05'] === 'check');
t('today excluded (in progress)', st['2026-10-08'] === 'today');
t('surplus day counted as negative', rows[6].status === 'ok' && rows[6].deficit === -100);
t('missing burn data -> noburn', D.buildDays({ from: '2026-10-01', to: '2026-10-01', intake: { '2026-10-01': 2000 }, burn: {}, today })[0].status === 'noburn');
const s = D.summary(rows, 500);
// counted: Oct1 600, Oct2 400, Oct4 600, Oct6 800, Oct7 -100 => total 2300 over 5 days
t('total 2300 over 5 counted days', s.total === 2300 && s.days === 5, JSON.stringify(s));
t('avg 460', s.avg === 460);
t('kg = 2300/7700 = 0.30', s.kg === 0.3);
t('on target (>=80% of planned 500 = 400): Oct1, Oct2, Oct4, Oct6 = 4', s.onTarget === 4, s.onTarget);
t('streak is 0 after a surplus day (skipping in-progress today)', s.streak === 0, s.streak);
t('best/worst', s.best.date === '2026-10-06' && s.worst.date === '2026-10-07');
t('skipped = nolog + check = 2', s.skipped === 2);
const s2 = D.summary(D.buildDays({ from: '2026-10-01', to: '2026-10-04', intake: { '2026-10-01': 2000, '2026-10-02': 2000, '2026-10-03': 2000, '2026-10-04': 2000 }, burn: { '2026-10-01': 2500, '2026-10-02': 2500, '2026-10-03': 2500, '2026-10-04': 2500 }, today: '2026-10-05' }));
t('streak counts consecutive deficit days = 4', s2.streak === 4);
t('no data -> avg null, no crash', D.summary(D.buildDays({ from: '2026-10-01', to: '2026-10-02', today: '2026-10-09' })).avg === null);
const cum = D.cumulative(rows);
t('cumulative: 600, 1000, 1000 (skipped), 1600, 1600, 2400, 2300, 2300', JSON.stringify(cum) === JSON.stringify([600, 1000, 1000, 1600, 1600, 2400, 2300, 2300]), JSON.stringify(cum));
t('cumulative null before first counted day', D.cumulative([{ status: 'nolog' }, { status: 'ok', deficit: 100 }])[0] === null);
t('predicted weight 72 - 7700/7700 = 71', D.predictedWeight(72, [0, 7700, null])[1] === 71 && D.predictedWeight(72, [null])[0] === null);
const wk = D.weekly(rows);   // 2026-10-01 is a Thursday: week of Mon 2026-09-28 and week of Mon 2026-10-05
t('weekly buckets (Monday start)', wk.length === 2 && wk[0].week === '2026-09-28' && wk[0].days === 3 && wk[0].total === 1600 && wk[1].week === '2026-10-05' && wk[1].total === 700, JSON.stringify(wk));
t('weight trend -0.5 kg/week', D.weightTrend([{ date: '2026-10-01', kg: 73 }, { date: '2026-10-08', kg: 72.5 }, { date: '2026-10-15', kg: 72 }]) === -0.5);
t('weight trend needs a week of data', D.weightTrend([{ date: '2026-10-01', kg: 73 }, { date: '2026-10-03', kg: 72.9 }]) === null && D.weightTrend([{ date: '2026-10-01', kg: 73 }]) === null);

// ── burn without a tracker: manual entries + TDEE estimate fallback ──
const T = '2026-10-08';
const mi = { '2026-10-01': 2000, '2026-10-02': 2100, '2026-10-03': 2000 };
const mb = { '2026-10-01': 2600 };                                          // only Oct 1 has a typed-in burn
let r2 = D.buildDays({ from: '2026-10-01', to: '2026-10-03', intake: mi, burn: mb, today: T, estimate: 2500 });
t('manual burn wins over the estimate', r2[0].burn === 2600 && r2[0].burnSource === 'manual' && r2[0].deficit === 600);
t('missing burn falls back to the TDEE estimate, flagged', r2[1].burn === 2500 && r2[1].burnSource === 'estimate' && r2[1].deficit === 400 && r2[1].status === 'ok');
t('summary counts estimated days', D.summary(r2).estimatedDays === 2 && D.summary(r2).days === 3);
r2 = D.buildDays({ from: '2026-10-01', to: '2026-10-03', intake: mi, burn: mb, today: T, estimate: 2500, useEstimate: false });
t('useEstimate=false skips days with no typed-in burn', r2[0].status === 'ok' && r2[1].status === 'noburn' && r2[1].burnSource === null);
r2 = D.buildDays({ from: '2026-10-01', to: '2026-10-02', intake: mi, burn: {}, today: T });
t('no burn and no estimate -> noburn (never guessed)', r2.every(r => r.status === 'noburn'));
t('a typed-in 0-intake day is still not counted', D.buildDays({ from: '2026-10-04', to: '2026-10-04', intake: {}, burn: { '2026-10-04': 2500 }, today: T, estimate: 2500 })[0].status === 'nolog');
