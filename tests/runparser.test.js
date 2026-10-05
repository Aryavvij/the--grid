const GRID = require('path').resolve(__dirname, '..');
const P = require(GRID + '/js/fuel/runs-parser.js');
const t = (n, ok, extra) => { console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : (extra || '')); if (!ok) process.exitCode = 1; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const T0 = Date.UTC(2026, 8, 1, 1, 0, 0);
const DEG = 111195;                                              // metres per degree latitude
// build points: segments = [{ m: metres, pace: sec/km }], optional pause [{ pauseSec }]
function gen(segs, opts = {}) {
  const pts = []; let t = T0, d = 0;
  const push = () => pts.push({ t, lat: 12.9 + d / DEG, lon: 77.6, ele: opts.ele ? opts.ele(d) : undefined, hr: opts.hr, cad: opts.cad, dist: opts.useDist ? d : undefined });
  push();
  for (const s of segs) {
    if (s.pauseSec) { t += s.pauseSec * 1000; push(); continue; }
    const v = 1000 / s.pace; const steps = Math.round(s.m / v);   // 1 point per second
    for (let i = 0; i < steps; i++) { t += 1000; d += v; push(); }
  }
  return pts;
}
const meta = { sourceFormat: 'gpx', fileHash: 'h'.repeat(12), sport: 'running' };

// 1. steady 10 km @ 5:00/km
let r = P.buildRun(gen([{ m: 10080, pace: 300 }]), meta); let run = r.run;
t('1 ok', r.ok);
t('1 distance ~10 km (haversine)', near(run.distanceM, 10080, 25), run.distanceM);
t('1 moving ~3000 s', near(run.movingSec, 3024, 8), run.movingSec);
t('1 ten splits of ~300 s', run.splits.length === 10 && run.splits.every(s => near(s.sec, 300, 2)), JSON.stringify(run.splits.map(s => s.sec)));
t('1 best 1K = 300, 5K = 1500, 10K ~3000', near(run.bestEfforts['1000'], 300, 2) && near(run.bestEfforts['5000'], 1500, 4) && near(run.bestEfforts['10000'], 3000, 8), JSON.stringify(run.bestEfforts));
t('1 no half-marathon effort on a 10K run', !('21098' in run.bestEfforts));
t('1 date is local YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(run.date));

// 2. pause: 10 min stop mid-run is excluded from moving time, kept in elapsed
r = P.buildRun(gen([{ m: 3000, pace: 300 }, { pauseSec: 600 }, { m: 2000, pace: 300 }]), meta); run = r.run;
t('2 moving excludes pause (~1500 s)', near(run.movingSec, 1500, 8), run.movingSec);
t('2 elapsed includes pause (~2100 s)', near(run.elapsedSec, 2100, 8), run.elapsedSec);
t('2 distance unaffected by pause', near(run.distanceM, 5000, 15), run.distanceM);

// 3. best effort is a sliding window, not tied to km boundaries: 3.5 km slow, 1 km fast, 1.5 km slow
r = P.buildRun(gen([{ m: 3500, pace: 360 }, { m: 1000, pace: 240 }, { m: 1500, pace: 360 }], { useDist: true }), meta); run = r.run;
t('3 best 1K = 240 (off-boundary window)', near(run.bestEfforts['1000'], 240, 2), JSON.stringify(run.bestEfforts));
t('3 best 5K faster than slowest-possible 6:00 pace (<1800)', run.bestEfforts['5000'] < 1790, JSON.stringify(run.bestEfforts));
t('3 km splits reflect fast km (km5 ~ 300 avg of 240/360 mix)', run.splits[3].sec < 360 && run.splits[4].sec < 360);

// 4. HR zones: constant 150 bpm, max 190 -> 78.9% -> zone 3
r = P.buildRun(gen([{ m: 2000, pace: 300 }], { hr: 150 }), { ...meta, maxHr: 190 }); run = r.run;
t('4 all time in z3', run.hrZones.z3 > 590 && run.hrZones.z1 === 0 && run.hrZones.z5 === 0, JSON.stringify(run.hrZones));
t('4 avg/max HR', run.avgHr === 150 && run.maxHr === 150);
r = P.buildRun(gen([{ m: 2000, pace: 300 }]), meta); t('4 no HR -> null zones and avg', r.run.hrZones === null && r.run.avgHr === null);

// 5. elevation: flat noise ignored, real climb counted
const noise = (d) => 900 + Math.sin(d / 7) * 0.6;
r = P.buildRun(gen([{ m: 4000, pace: 300 }], { ele: noise }), meta); t('5 GPS noise gives ~0 gain', r.run.elevGainM <= 3, r.run.elevGainM);
r = P.buildRun(gen([{ m: 4000, pace: 300 }], { ele: (d) => 900 + d * 0.025 }), meta); t('5 steady 100 m climb ~100 gain', near(r.run.elevGainM, 100, 8), r.run.elevGainM);
r = P.buildRun(gen([{ m: 2000, pace: 300 }]), meta); t('5 no elevation data -> null gain', r.run.elevGainM === null);

// 6. cadence doubling (FIT per-leg) vs already-spm
r = P.buildRun(gen([{ m: 2000, pace: 300 }], { cad: 85 }), meta); t('6 cadence 85 -> 170 spm', r.run.cadence === 170, r.run.cadence);
r = P.buildRun(gen([{ m: 2000, pace: 300 }], { cad: 172 }), meta); t('6 cadence 172 stays 172', r.run.cadence === 172, r.run.cadence);

// 7. rejections
t('7 cycling rejected', P.buildRun(gen([{ m: 5000, pace: 150 }]), { ...meta, sport: 'cycling' }).reason.includes('not a run'));
t('7 Strava gpx type "9" accepted as run', P.buildRun(gen([{ m: 2000, pace: 300 }]), { ...meta, sport: '9' }).ok);
t('7 trail running accepted', P.isRunSport('Trail Running') && P.isRunSport('VirtualRun') && !P.isRunSport('Ride') && !P.isRunSport('Walk'));
t('7 unknown sport accepted', P.isRunSport(undefined));
t('7 too short rejected', !P.buildRun(gen([{ m: 50, pace: 300 }]), meta).ok);
t('7 empty rejected', !P.buildRun([], meta).ok && !P.buildRun(null, meta).ok);
t('7 standing still rejected', !P.buildRun(gen([{ pauseSec: 120 }]), meta).ok);

// 8. downsampling and shapes
r = P.buildRun(gen([{ m: 21400, pace: 330 }], { hr: 150 }), meta); run = r.run;
t('8 route <= 300 points', run.route.length <= 300 && run.route.length > 100, run.route.length);
t('8 streams <= 300 and aligned', ['dist', 'pace', 'hr', 'ele', 'cad'].every(k => run.streams[k].length === run.streams.dist.length) && run.streams.dist.length <= 300);
t('8 stream distance is monotonic and ends near total', run.streams.dist.every((v, i, a) => i === 0 || v >= a[i - 1]) && near(run.streams.dist.at(-1), run.distanceM, 5));
t('8 pace stream ~330 mid-run', near(run.streams.pace[150], 330, 6), run.streams.pace[150]);
t('8 half marathon best effort exists on a 21K run', '21098' in run.bestEfforts && near(run.bestEfforts['21098'], 330 * 21.098, 10), JSON.stringify(run.bestEfforts));
t('8 payload size per run < 40 KB', JSON.stringify(run).length < 40000, JSON.stringify(run).length);
t('8 haversine 1 km north', near(P.haversine({ lat: 12.9, lon: 77.6 }, { lat: 12.9 + 1000 / DEG, lon: 77.6 }), 1000, 1));

// 9. summary (CSV) runs
const sr = P.buildSummaryRun({ startTime: '2026-09-01T06:30:00Z', distanceM: 5200.4, movingSec: 1620, name: 'Morning Run', avgHr: 158.4, calories: 410, fileHash: 'csv:123' });
t('9 summary run ok, no route/streams', sr.ok && sr.run.route === null && sr.run.streams === null && sr.run.sourceFormat === 'csv' && sr.run.distanceM === 5200);
t('9 summary with no distance rejected', !P.buildSummaryRun({ startTime: '2026-09-01T06:30:00Z', distanceM: 0, movingSec: 0 }).ok);

// 10. matches the API contract (zod schema in routes/runs.js)
const { z } = require(GRID + '/grid-backend/node_modules/zod');
const src = require('fs').readFileSync(GRID + '/grid-backend/src/routes/runs.js', 'utf8');
t('10 route accepts bestEfforts + 500-point caps', /bestEfforts:\s+z\.record/.test(src) && /\.max\(500\)/.test(src));
