const GRID = require('path').resolve(__dirname, '..');
const G = require(GRID + '/js/fuel/gym-calc.js');
const t = (n, ok, x) => { console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : x); if (!ok) process.exitCode = 1; };
const S = (w, r) => ({ weight: w, reps: r });
const logs = [
  { date: '2026-08-03', exercises: [{ name: 'BENCH PRESS', sets: [S(60, 8), S(60, 8), S(60, 6)] }, { name: 'SQUAT', sets: [S(80, 5)] }] },
  { date: '2026-08-10', exercises: [{ name: 'Bench Press', sets: [S(62.5, 8), S(62.5, 7)] }] },                // case-insensitive
  { date: '2026-08-17', exercises: [{ name: 'BENCH PRESS', sets: [S(65, 8), S(65, 6), S(0, 0), { weight: 70, reps: 0 }] }] },   // junk sets ignored
  { date: '2026-09-14', exercises: [{ name: 'BENCH PRESS', sets: [S(60, 10)] }] },
  { date: '2026-09-21', exercises: [{ name: 'BENCH PRESS', sets: [S(62.5, 8)] }] },
  { date: '2026-09-28', exercises: [{ name: 'BENCH PRESS', sets: [S(60, 9)] }, { name: 'ROW', sets: [S(50, 10), S(50, 10)] }] },
];
t('epley 100x5 = 116.7', G.e1rm(100, 5) === 116.7);
t('epley 60x8 = 76', G.e1rm(60, 8) === 76);
t('volume ignores junk sets: 65*8+65*6 = 910', G.sessionVolume(logs[2]) === 910);
t('session sets', G.sessionSets(logs[0]) === 4 && G.sessionSets(logs[2]) === 2);
t('names by frequency, case-insensitive merge', JSON.stringify(G.exerciseNames(logs)) === JSON.stringify(['BENCH PRESS', 'SQUAT', 'ROW']), JSON.stringify(G.exerciseNames(logs)));
const h = G.history(logs, 'bench press');
t('history: 6 sessions ascending', h.length === 6 && h[0].date === '2026-08-03' && h.at(-1).date === '2026-09-28');
t('top set chosen by e1RM (60x8 beats 60x6)', h[0].weight === 60 && h[0].reps === 8 && h[0].e1rm === 76);
t('top set: 65x8 (e1RM 82.3) beats 65x6', h[2].e1rm === 82.3 && h[2].reps === 8, JSON.stringify(h[2]));
t('history volume per session', h[0].volume === 60 * 8 + 60 * 8 + 60 * 6);
const same = G.history([{ date: '2026-09-01', exercises: [{ name: 'X', sets: [S(50, 5)] }] }, { date: '2026-09-01', exercises: [{ name: 'X', sets: [S(60, 5)] }] }], 'X');
t('two sessions same day -> keep the better one', same.length === 1 && same[0].weight === 60, JSON.stringify(same));
const pr = G.withPRs(h);
t('PR flags: first session is baseline; Aug10 (62.5x8=79.2) and Aug17 are PRs', !pr[0].pr && pr[1].pr && pr[2].pr && !pr[3].pr && !pr[4].pr && !pr[5].pr, JSON.stringify(pr.map(p => p.pr)));
t('plateau: 3 sessions since Sep 1 with no new best -> true', G.plateau(h, '2026-09-30') === true);
t('not a plateau if a recent PR', G.plateau(G.history([...logs, { date: '2026-09-29', exercises: [{ name: 'BENCH PRESS', sets: [S(80, 8)] }] }], 'BENCH PRESS'), '2026-09-30') === false);
t('not a plateau with too few recent sessions', G.plateau(h.slice(0, 4), '2026-09-30') === false);
t('not a plateau with no history before the window', G.plateau(h.slice(3), '2026-09-30') === false);
t('plateau on empty is false', G.plateau([], '2026-09-30') === false);
const board = G.prBoard(logs);
t('PR board sorted by e1RM, bench best = 82.3 on Aug 17', board[0].name === 'SQUAT' ? board[0].e1rm === 93.3 : false, JSON.stringify(board[0]));
const bench = board.find(b => b.name === 'BENCH PRESS'); t('bench current best 82.3, previous 79.2, 6 sessions', bench.e1rm === 82.3 && bench.prevE1rm === 79.2 && bench.sessions === 6, JSON.stringify(bench));
const mus = (n) => ({ 'BENCH PRESS': 'CHEST', SQUAT: 'QUADS', ROW: 'BACK' }[n]);
const wk = G.weeklySets(logs, mus, '2026-09-30', 4);   // weeks starting Sep 7, 14, 21, 28? week of 2026-09-30 starts Mon Sep 28
t('4 weekly buckets ending in current week', JSON.stringify(Object.keys(wk)) === JSON.stringify(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']), JSON.stringify(Object.keys(wk)));
t('weekly sets by muscle', wk['2026-09-14'].CHEST === 1 && wk['2026-09-28'].CHEST === 1 && wk['2026-09-28'].BACK === 2 && !wk['2026-09-07'].CHEST, JSON.stringify(wk));
t('older sessions fall outside the window', !('2026-08-03' in wk));
t('unknown exercise -> OTHER', G.weeklySets([{ date: '2026-09-29', exercises: [{ name: 'MYSTERY', sets: [S(10, 10)] }] }], () => null, '2026-09-30', 1)['2026-09-28'].OTHER === 1);
// malformed stored data must never throw
const junk = [{ date: 'garbage', exercises: [{ name: 'A', sets: [S(10, 10)] }] }, { date: null, exercises: null }, { date: '2026-09-29' }, { date: '2026-09-29', exercises: [{ name: 'B', sets: null }, { name: 'C', sets: [null, S(20, 5)] }] }];
let threw = null; try { G.exerciseNames(junk); G.history(junk, 'A'); G.prBoard(junk.filter(l => l.exercises)); G.weeklySets(junk, () => 'X', '2026-09-30', 4);  G.sessionVolume(junk[2]); } catch (e) { threw = e; }
t('malformed logs never throw', threw === null, threw && threw.message);
t('malformed dates ignored in history/weekly/recovery', G.history(junk, 'A').length === 0 && G.weeklySets(junk, () => 'X', '2026-09-30', 1)['2026-09-28'].X === 1);
t('invalid date helpers return null', G.addDays('nope', 1) === null && G.weekStart('2026-13-45') === null);
