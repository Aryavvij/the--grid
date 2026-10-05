/* Deterministic mock data for demo mode: 90 days of health, 12 months of runs, 14 days of nutrition.
   One persona, numbers consistent across every page. Same shape as the API responses. */
(function () {
  const G = window.Grid, C = G.calc, F = G.fmt;
  const rng = (seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(20261005);
  const jit = (c, spread) => c + (rng() - 0.5) * 2 * spread;
  const day = (offset) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset); return d; };

  // ── runs: ~3.5 per week for 12 months, gradually faster ──
  const runs = [];
  for (let off = 364; off >= 0; off--) {
    const d = day(off), dow = d.getDay();
    const plan = { 2: 0.9, 4: 0.8, 6: 0.85, 0: 0.5 }[dow];       // Tue, Thu, Sat, Sun-ish
    if (!plan || rng() > plan) continue;
    const long = dow === 6 || dow === 0 && rng() > 0.5;
    const km = long ? jit(10.5, 2.2) : jit(6.2, 1.4);
    const pace = jit(345 - (364 - off) * 0.045 + (long ? 18 : 0), 14);        // sec/km, improves ~16s over the year
    const moving = Math.round(km * pace), hr = Math.round(jit(long ? 154 : 160, 5));
    const start = new Date(d); start.setHours(long ? 6 : 17, 30 + Math.floor(rng() * 25));
    const splits = Array.from({ length: Math.floor(km) }, (_, i) => ({ km: i + 1, sec: Math.round(pace + (rng() - 0.5) * 22 + (i > km * 0.7 ? 6 : 0)), hr: Math.round(hr - 6 + i * 1.2 + rng() * 3), elevDelta: Math.round((rng() - 0.45) * 14) }));
    runs.push({ id: 'r' + off, date: F.date(d), startTime: start.toISOString(), name: (long ? 'Long Run' : ['Easy Run', 'Tempo Run', 'Morning Run', 'Evening Run'][Math.floor(rng() * 4)]),
      distanceM: Math.round(km * 1000), movingSec: moving, elapsedSec: moving + Math.round(rng() * 90), avgHr: hr, maxHr: hr + 17 + Math.round(rng() * 6), cadence: Math.round(jit(168, 4)),
      elevGainM: Math.round(jit(long ? 90 : 45, 25)), calories: Math.round(km * 68), gear: off > 150 ? 'Pegasus 40' : 'Vomero 17', sourceFormat: 'fit', splits });
  }

  // best efforts and HR zones derived from each demo run's splits (real imports compute these from the track)
  runs.forEach(r => {
    const secs = r.splits.map(x => x.sec), win = (n) => { if (secs.length < n) return null; let b = Infinity; for (let i = 0; i + n <= secs.length; i++) b = Math.min(b, secs.slice(i, i + n).reduce((a, c) => a + c, 0)); return Math.round(b); };
    r.bestEfforts = {}; const m = Math.min(...secs); if (isFinite(m)) { r.bestEfforts['1000'] = m; r.bestEfforts['1609'] = Math.round(m * 1.609 * 1.01); }
    [[3, '3000'], [5, '5000'], [10, '10000']].forEach(([n, k]) => { const w = win(n); if (w) r.bestEfforts[k] = w; });
    const z = r.movingSec, f = r.avgHr / 190; r.hrZones = { z1: Math.round(z * 0.03), z2: Math.round(z * (f < 0.8 ? 0.22 : 0.12)), z3: Math.round(z * (f < 0.8 ? 0.5 : 0.38)), z4: Math.round(z * (f < 0.8 ? 0.22 : 0.37)), z5: Math.round(z * 0.05) };
  });

  // ── health: 90 days, correlated with training ──
  const runByDate = {}; runs.forEach(r => { runByDate[r.date] = r; });
  const daily = [], sleep = [];
  let prevLoad = 60;
  for (let off = 89; off >= 0; off--) {
    const d = day(off), ds = F.date(d), run = runByDate[ds];
    const hardYesterday = prevLoad > 90;
    const sleepMin = Math.round(jit(hardYesterday ? 430 : 410, 48));
    const deep = Math.round(sleepMin * jit(0.145, 0.035)), rem = Math.round(sleepMin * jit(0.195, 0.035)), awake = Math.round(jit(38, 12));
    const light = sleepMin - deep - rem, eff = +(100 * sleepMin / (sleepMin + awake)).toFixed(1);
    const sObj = { minutesAsleep: sleepMin, deepMin: deep, remMin: rem, efficiency: eff };
    const start = new Date(d); start.setHours(0, 0, 0, 0); start.setMinutes(Math.round(jit(-45, 40)));
    const end = new Date(start.getTime() + (sleepMin + awake) * 60000);
    sleep.push({ id: 's' + off, date: ds, startTime: start.toISOString(), endTime: end.toISOString(), minutesAsleep: sleepMin, minutesAwake: awake, lightMin: light, deepMin: deep, remMin: rem, efficiency: eff,
      score: C.sleepScore(sObj), sleepingHr: Math.round(jit(48, 3)),
      stages: (() => { let t = start.getTime(), out = []; const order = ['light', 'deep', 'light', 'rem', 'light', 'deep', 'rem', 'light', 'awake', 'rem', 'light']; const tot = sleepMin + awake; order.forEach((ty, i) => { const dur = ty === 'awake' ? awake : Math.round(tot / order.length * jit(1, 0.3)); out.push({ type: ty, start: new Date(t).toISOString(), end: new Date(t + dur * 60000).toISOString() }); t += dur * 60000; }); return out; })() });
    const zones = run ? { outOfRange: 1300, fatBurn: Math.round(run.movingSec / 60 * 0.35 + 25), cardio: Math.round(run.movingSec / 60 * 0.5), peak: Math.round(run.movingSec / 60 * 0.08) } : { outOfRange: 1380, fatBurn: Math.round(jit(32, 14)), cardio: Math.round(jit(6, 5)), peak: 0 };
    const load = C.cardioLoad(zones);
    daily.push({ id: 'd' + off, date: ds, restingHr: Math.round(jit(55 + (hardYesterday ? 2 : 0), 2)), hrvMs: +jit(hardYesterday ? 56 : 63, 6).toFixed(0) * 1, spo2Avg: +jit(96.3, 0.7).toFixed(1), spo2Min: +jit(92.5, 1.3).toFixed(1),
      skinTempDelta: +jit(0.05, 0.35).toFixed(1), breathingRate: +jit(14.8, 0.7).toFixed(1), steps: Math.round(jit(run ? 12500 : 8200, 1900)), distanceM: Math.round(jit(run ? 9800 : 6200, 1300)),
      caloriesTotal: Math.round(jit(run ? 2850 : 2420, 140)), caloriesActive: Math.round(jit(run ? 700 : 300, 80)), azmMinutes: Math.round(run ? run.movingSec / 60 * 1.6 : jit(14, 8)), sedentaryMin: Math.round(jit(560, 60)),
      cardioLoad: load, hrZones: zones, source: 'demo', _sleepScore: sObj && C.sleepScore(sObj) });
    prevLoad = load;
  }
  // readiness needs baselines, so fill it in a second pass
  daily.forEach((d, i) => {
    const win = daily.slice(Math.max(0, i - 28), i + 1);
    d.readiness = C.readiness({ hrv: d.hrvMs, hrvBase: G.stats.avg(win.map(x => x.hrvMs)), rhr: d.restingHr, rhrBase: G.stats.avg(win.map(x => x.restingHr)), sleepScore: d._sleepScore, loadRatio: C.loadRatio(daily.slice(0, i + 1).map(x => x.cardioLoad)) });
    delete d._sleepScore;
  });

  // ── nutrition ──
  const presets = [
    ['B1', 'Oats & Whey', 410, 32, 48, 9, 'breakfast'], ['B2', '3 Egg Toast', 380, 24, 28, 18, 'breakfast'], ['S1', 'Protein Bar', 210, 20, 22, 7, 'snack'],
    ['S2', 'Greek Yogurt & Fruit', 180, 17, 22, 2, 'snack'], ['S3', 'Peanut Butter Banana', 290, 9, 38, 12, 'snack'], ['L1', 'Chicken Rice Bowl', 620, 48, 70, 14, 'lunch'],
    ['L2', 'Dal Rice Combo', 580, 22, 92, 11, 'lunch'], ['D1', 'Paneer Wrap', 540, 28, 52, 24, 'dinner'], ['SHAKE', 'Post-workout Shake', 260, 40, 18, 3, 'snack'], ['COFFEE', 'Black Coffee', 5, 0, 1, 0, 'breakfast'],
  ].map((p, i) => ({ id: 'p' + i, code: p[0], name: p[1], calories: p[2], protein: p[3], carbs: p[4], fat: p[5], defaultSlot: p[6], serving: '1 serving', favorite: i < 3, useCount: 40 - i * 3 }));
  const foodlog = []; let fid = 0;
  for (let off = 59; off >= 0; off--) {
    const ds = F.date(day(off));
    if (off > 0 && rng() < 0.06) continue;                                           // a day with nothing logged
    const treat = rng() < 0.08 ? [['D1', 'snack'], ['S3', 'snack']] : [];            // occasional surplus day
    [['B1', 'breakfast'], ['COFFEE', 'breakfast'], [rng() > 0.5 ? 'L1' : 'L2', 'lunch'], ['S1', 'snack'], [rng() > 0.5 ? 'D1' : 'L1', 'dinner'], [rng() > 0.4 ? 'SHAKE' : 'S2', 'snack'], ...treat].forEach(([code, slot]) => {
      if (off === 0 && (slot === 'dinner' || slot === 'snack' && code !== 'S1')) return;       // today is partly logged
      const p = presets.find(x => x.code === code);
      foodlog.push({ id: 'f' + (fid++), date: ds, slot, name: p.name, serving: p.serving, qty: 1, calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat, presetCode: p.code, confidence: 'exact' });
    });
  }
  const targets = { calories: 2350, protein: 160, carbs: 250, fat: 70, waterMl: 3000, plan: { sex: 'male', age: 21, kg: 72, cm: 175, level: 'moderate', bmr: C.bmr({ sex: 'male', kg: 72, cm: 175, age: 21 }) } };
  targets.plan.tdee = C.tdee(targets.plan.bmr, 'moderate');
  const water = Array.from({ length: 35 }, (_, i) => ({ date: F.date(day(34 - i)), ml: Math.round(jit(2400, 500)) }));
  // weight every ~2 days, drifting down with the deficit; photos are user-uploaded (none in demo until added)
  const weight = []; for (let off = 59; off >= 0; off -= 2) weight.push({ date: F.date(day(off)), kg: +(74.6 - (59 - off) * 0.035 + (rng() - 0.5) * 0.5).toFixed(1) });
  const photos = [];

  const desc = (a) => a.slice().sort((x, y) => (x.date < y.date ? 1 : -1));
  G.seed = {
    /** Demo-mode importer target: add parsed runs to the in-memory history. */
    setWeight(date, kg) { const i = weight.findIndex(w => w.date === date); if (i >= 0) weight[i].kg = kg; else { weight.push({ date, kg }); weight.sort((a, b) => (a.date < b.date ? -1 : 1)); } },
    delWeight(date) { const i = weight.findIndex(w => w.date === date); if (i >= 0) weight.splice(i, 1); },
    addPhoto(p) { const row = { id: 'ph' + Date.now() + Math.random().toString(36).slice(2, 5), ...p }; photos.push(row); photos.sort((a, b) => (a.date < b.date ? -1 : 1)); return row; },
    delPhoto(id) { const i = photos.findIndex(x => x.id === id); if (i >= 0) photos.splice(i, 1); },
    photo(id) { return photos.find(x => x.id === id) || null; },
    removeRun(id) { const i = runs.findIndex(x => x.id === id); if (i >= 0) runs.splice(i, 1); },
    addRuns(rs) { rs.forEach((r, i) => runs.push({ ...r, id: 'u' + Date.now() + i })); },
    /** Full detail for one run. Seeded runs have no stored track, so draw a plausible loop + streams from their splits. */
    runDetail(id) {
      const r = runs.find(x => x.id === id); if (!r) return null;
      if (r.streams && r.route) return r;
      const km = r.distanceM / 1000, n = 120, dist = [], pace = [], hr = [], ele = [], cad = [], route = [];
      const sp = r.splits && r.splits.length ? r.splits : [{ sec: r.movingSec / km, hr: r.avgHr, elevDelta: 0 }];
      let elev = 900; const cx = 12.97, cy = 77.59, rad = Math.max(0.004, km / 80);
      for (let i = 0; i < n; i++) {
        const d = (i / (n - 1)) * r.distanceM, s = sp[Math.min(sp.length - 1, Math.floor(d / 1000))];
        dist.push(Math.round(d)); pace.push(Math.round(s.sec + Math.sin(i / 6) * 6)); hr.push(Math.round((s.hr || r.avgHr) + Math.sin(i / 9) * 3));
        elev += (s.elevDelta || 0) / (n / sp.length); ele.push(Math.round(elev * 10) / 10); cad.push(Math.round(r.cadence + Math.sin(i / 5) * 3));
        const a = (i / (n - 1)) * Math.PI * 2; route.push([+(cx + Math.cos(a) * rad).toFixed(5), +(cy + Math.sin(a) * rad * 1.3).toFixed(5)]);
      }
      const secs = r.splits.map(x => x.sec), fastest = secs.length ? Math.min(...secs) : r.movingSec / km;
      return { ...r, route, streams: { dist, pace, hr, ele, cad }, bestEfforts: r.bestEfforts || { 1000: Math.round(fastest), 5000: km >= 5 ? Math.round(r.movingSec / km * 5 * 0.98) : undefined } };
    },
    get(kind, p = {}) {
      const rows = { daily: desc(daily), sleep: desc(sleep), runs: runs.slice().sort((a, b) => (a.startTime < b.startTime ? 1 : -1)), presets, foodlog: desc(foodlog), targets, water: desc(water), weight: weight.slice(), photos: photos.slice() }[kind];
      if (!rows) return [];
      if (Array.isArray(rows) && (p.from || p.to)) return rows.filter(r => (!p.from || r.date >= p.from) && (!p.to || r.date <= p.to));
      return Array.isArray(rows) && p.limit ? rows.slice(0, +p.limit) : rows;
    },
  };
})();
