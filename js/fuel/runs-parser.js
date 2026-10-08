/* Run metrics from raw track points. Pure functions (no DOM): loaded by the browser and by node for tests.
   Input points: [{ t: ms epoch, lat, lon, ele, hr, cad, dist }]  (dist = cumulative metres, optional)
   Output: an object matching POST /api/runs/import. */
(function (root) {
  const PAUSE_GAP_S = 30;        // a gap longer than this between points is a pause, not running
  const MIN_SPEED = 0.5;         // m/s: slower than this counts as stopped
  const BEST_TARGETS = [1000, 1609, 3000, 5000, 10000, 15000, 21098];
  const MAX_STREAM = 300;

  const rad = (d) => (d * Math.PI) / 180;
  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }
  const avg = (a) => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  /** Sports we accept as "a run". Unknown/missing sport is accepted (flagged by caller if it wants). */
  function isRunSport(sport) { return sport == null || sport === '' || /run|jog|treadmill/i.test(String(sport)) || String(sport) === '9'; }

  /** Cumulative distance + moving time per point. Returns parallel arrays. */
  function track(points) {
    const pts = points.filter(p => p.t != null && isFinite(p.t)).sort((a, b) => a.t - b.t);
    const dist = [0], mov = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dt = (b.t - a.t) / 1000;
      let dd;
      if (b.dist != null && a.dist != null) dd = Math.max(0, b.dist - a.dist);
      else if (a.lat != null && b.lat != null) dd = haversine(a, b);
      else dd = 0;
      const speed = dt > 0 ? dd / dt : 0;
      const moving = dt > 0 && dt <= PAUSE_GAP_S && speed >= MIN_SPEED;
      dist.push(dist[i - 1] + (dt <= PAUSE_GAP_S || b.dist != null ? dd : 0));
      mov.push(mov[i - 1] + (moving ? dt : 0));
    }
    return { pts, dist, mov };
  }

  /** Elevation gain with a 5-point moving average and a 2 m hysteresis to ignore GPS noise. */
  function elevationGain(pts) {
    const e = pts.map(p => p.ele).filter(v => v != null && isFinite(v));
    if (e.length < 3) return null;
    const sm = e.map((_, i) => avg(e.slice(Math.max(0, i - 2), i + 3)));
    let gain = 0, anchor = sm[0];
    for (const v of sm) { if (v - anchor >= 2) { gain += v - anchor; anchor = v; } else if (anchor - v >= 2) anchor = v; }
    return Math.round(gain);
  }

  /** Time (moving seconds) at which cumulative distance first reaches d, interpolated. */
  function timeAt(dist, mov, d, from = 0) {
    let i = from; while (i < dist.length && dist[i] < d) i++;
    if (i >= dist.length) return null;
    if (i === 0 || dist[i] === dist[i - 1]) return { t: mov[i], i };
    const f = (d - dist[i - 1]) / (dist[i] - dist[i - 1]);
    return { t: mov[i - 1] + f * (mov[i] - mov[i - 1]), i };
  }

  /** Full-kilometre splits: { km, sec, hr, elevDelta }. */
  function splits(pts, dist, mov) {
    const out = [], total = dist.at(-1);
    let startT = 0, startIdx = 0;
    for (let k = 1; k * 1000 <= total; k++) {
      const r = timeAt(dist, mov, k * 1000, startIdx); if (!r) break;
      const seg = pts.slice(startIdx, r.i + 1);
      const e0 = pts[startIdx].ele, e1 = pts[r.i].ele;
      out.push({ km: k, sec: Math.round(r.t - startT), hr: avg(seg.map(p => p.hr)) != null ? Math.round(avg(seg.map(p => p.hr))) : null, elevDelta: e0 != null && e1 != null ? Math.round(e1 - e0) : null });
      startT = r.t; startIdx = r.i;
    }
    return out;
  }

  /** Fastest window for each target distance (sliding window over cumulative distance). */
  function bestEfforts(dist, mov) {
    const out = {}, n = dist.length, total = dist.at(-1);
    for (const target of BEST_TARGETS) {
      if (total < target) continue;
      let best = Infinity, j = 0;
      for (let i = 0; i < n; i++) {
        if (j < i) j = i;
        while (j < n && dist[j] - dist[i] < target) j++;
        if (j >= n) break;
        // interpolate the exact end so the window is `target` metres, not "first point past it"
        const over = dist[j] - dist[i] - target, seg = dist[j] - dist[j - 1];
        const tEnd = seg > 0 ? mov[j] - (over / seg) * (mov[j] - mov[j - 1]) : mov[j];
        best = Math.min(best, tEnd - mov[i]);
      }
      if (isFinite(best) && best > 0) out[String(target)] = Math.round(best * 10) / 10;
    }
    return out;
  }

  /** Seconds in 5 HR zones (percent of max HR: <60, 60-70, 70-80, 80-90, 90+). */
  function hrZones(pts, mov, maxHr) {
    const z = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }; let any = false;
    for (let i = 1; i < pts.length; i++) {
      const hr = pts[i].hr, dt = mov[i] - mov[i - 1]; if (!hr || dt <= 0) continue;
      any = true; const p = hr / maxHr;
      z[p < 0.6 ? 'z1' : p < 0.7 ? 'z2' : p < 0.8 ? 'z3' : p < 0.9 ? 'z4' : 'z5'] += dt;
    }
    if (!any) return null; Object.keys(z).forEach(k => { z[k] = Math.round(z[k]); }); return z;
  }

  function sampleIdx(n, max) { if (n <= max) return Array.from({ length: n }, (_, i) => i); return Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1))); }

  /** Pace per point over a +/- window of moving time, so the chart isn't jagged. */
  function smoothPace(dist, mov, i, win = 6) {
    const a = Math.max(0, i - win), b = Math.min(dist.length - 1, i + win), dd = dist[b] - dist[a], dt = mov[b] - mov[a];
    return dd > 5 && dt > 0 ? Math.round(dt / (dd / 1000)) : null;
  }

  /**
   * Build a run from points.
   * meta: { name, sport, gear, calories, sourceFormat, fileHash, maxHr, startTime (ISO, optional override) }
   * Returns { ok:true, run } or { ok:false, reason }.
   */
  function buildRun(points, meta = {}) {
    if (!isRunSport(meta.sport)) return { ok: false, reason: `not a run (${meta.sport})` };
    const { pts, dist, mov } = track(points || []);
    if (pts.length < 2) return { ok: false, reason: 'no usable track points' };
    const distanceM = dist.at(-1), movingSec = Math.round(mov.at(-1)), elapsedSec = Math.round((pts.at(-1).t - pts[0].t) / 1000);
    if (distanceM < 100) return { ok: false, reason: 'distance under 100 m' };
    if (movingSec < 30) return { ok: false, reason: 'moving time under 30 s' };

    const hrs = pts.map(p => p.hr).filter(h => h > 30 && h < 250);
    const cads = pts.map(p => p.cad).filter(c => c > 0);
    let cadence = cads.length ? avg(cads) : null;
    if (cadence != null && cadence < 120) cadence *= 2;                       // FIT stores running cadence per leg
    const start = new Date(meta.startTime || pts[0].t);
    const d = start;
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const idx = sampleIdx(pts.length, MAX_STREAM);
    const gps = idx.filter(i => pts[i].lat != null && pts[i].lon != null);
    const run = {
      date, startTime: start.toISOString(), name: meta.name || null, distanceM: Math.round(distanceM), movingSec, elapsedSec,
      avgHr: hrs.length ? Math.round(avg(hrs)) : null, maxHr: hrs.length ? Math.max(...hrs) : null,
      cadence: cadence != null ? Math.round(cadence) : null, elevGainM: elevationGain(pts), calories: meta.calories ?? null, gear: meta.gear || null,
      splits: splits(pts, dist, mov), hrZones: hrZones(pts, mov, meta.maxHr || 190), bestEfforts: bestEfforts(dist, mov),
      route: gps.length > 1 ? gps.map(i => [+pts[i].lat.toFixed(5), +pts[i].lon.toFixed(5)]) : null,
      streams: { dist: idx.map(i => Math.round(dist[i])), pace: idx.map(i => smoothPace(dist, mov, i)), hr: idx.map(i => pts[i].hr || null),
        ele: idx.map(i => (pts[i].ele != null ? Math.round(pts[i].ele * 10) / 10 : null)), cad: idx.map(i => (pts[i].cad ? Math.round(pts[i].cad < 120 ? pts[i].cad * 2 : pts[i].cad) : null)) },
      fileHash: meta.fileHash, sourceFormat: meta.sourceFormat,
    };
    if (!run.streams.ele.some(v => v != null)) run.streams.ele = idx.map(() => null);
    return { ok: true, run };
  }

  /** Summary-only run (Strava activities.csv row, no track). */
  function buildSummaryRun(row) {
    const distanceM = Math.round(row.distanceM || 0), movingSec = Math.round(row.movingSec || 0);
    if (distanceM < 100 || movingSec < 30) return { ok: false, reason: 'row has no usable distance/time' };
    const d = new Date(row.startTime), pad = (n) => String(n).padStart(2, '0');
    return { ok: true, run: { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, startTime: d.toISOString(), name: row.name || null, distanceM, movingSec,
      elapsedSec: row.elapsedSec ? Math.round(row.elapsedSec) : null, avgHr: row.avgHr ? Math.round(row.avgHr) : null, maxHr: row.maxHr ? Math.round(row.maxHr) : null,
      cadence: null, elevGainM: row.elevGainM ?? null, calories: row.calories ? Math.round(row.calories) : null, gear: row.gear || null,
      splits: null, hrZones: null, bestEfforts: null, route: null, streams: null, fileHash: row.fileHash, sourceFormat: 'csv' } };
  }

  const api = { buildRun, buildSummaryRun, isRunSport, haversine, track, elevationGain, splits, bestEfforts, hrZones, BEST_TARGETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Grid = root.Grid || {}).runParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
