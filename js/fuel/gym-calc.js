/* Gym progress maths over the existing gymLogs shape:
   [{ date:'YYYY-MM-DD', exercises:[{ name, sets:[{ weight, reps, orm? }], isPR? }] }]
   Pure functions (browser + node tests). e1RM uses Epley, the same formula the logger uses. */
(function (root) {
  const e1rm = (w, r) => +(w * (1 + r / 30)).toFixed(1);
  const validDate = (iso) => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(new Date(iso + 'T12:00:00Z'));
  const addDays = (iso, n) => { if (!validDate(iso)) return null; const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStart = (iso) => { if (!validDate(iso)) return null; const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const clean = (sets) => (sets || []).filter(s => s && s.weight > 0 && s.reps > 0);
  const up = (n) => String(n || '').trim().toUpperCase();

  const sessionVolume = (log) => (log.exercises || []).reduce((t, ex) => t + clean(ex.sets).reduce((s, x) => s + x.weight * x.reps, 0), 0);
  const sessionSets = (log) => (log.exercises || []).reduce((t, ex) => t + clean(ex.sets).length, 0);

  /** Names of every exercise that appears in the logs (uppercase, sorted by how often they were trained). */
  function exerciseNames(logs) {
    const n = {}; logs.forEach(l => validDate(l.date) && (l.exercises || []).forEach(ex => { if (clean(ex.sets).length) n[up(ex.name)] = (n[up(ex.name)] || 0) + 1; }));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  }

  /** One point per session for an exercise: top set by e1RM, volume, set count. Ascending by date. */
  function history(logs, name) {
    const pts = [];
    logs.forEach(l => validDate(l.date) && (l.exercises || []).forEach(ex => {
      if (up(ex.name) !== up(name)) return; const sets = clean(ex.sets); if (!sets.length) return;
      const top = sets.reduce((b, s) => (e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps) ? s : b));
      pts.push({ date: l.date, weight: top.weight, reps: top.reps, e1rm: e1rm(top.weight, top.reps), maxWeight: Math.max(...sets.map(s => s.weight)), volume: sets.reduce((t, s) => t + s.weight * s.reps, 0), sets: sets.length });
    }));
    pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    // two entries on one date: keep the better one
    return pts.filter((p, i) => !(pts[i + 1] && pts[i + 1].date === p.date && pts[i + 1].e1rm >= p.e1rm)).filter((p, i, a) => !(a[i - 1] && a[i - 1].date === p.date));
  }

  /** Marks the sessions that beat every earlier e1RM (the first session is a baseline, not a PR). */
  function withPRs(points) { let best = 0; return points.map((p, i) => { const pr = i > 0 && p.e1rm > best; best = Math.max(best, p.e1rm); return { ...p, pr }; }); }

  /** No new e1RM best in `days` days, despite at least `minSessions` sessions in that window. */
  function plateau(points, today, days = 28, minSessions = 3) {
    if (!points.length) return false;
    const cutoff = addDays(today, -days), recent = points.filter(p => p.date > cutoff), before = points.filter(p => p.date <= cutoff);
    if (recent.length < minSessions || !before.length) return false;
    return Math.max(...recent.map(p => p.e1rm)) <= Math.max(...before.map(p => p.e1rm));
  }

  /** Best e1RM per exercise with the PR before it. */
  function prBoard(logs) {
    return exerciseNames(logs).map(name => {
      const raw = history(logs, name); if (!raw.length) return null;
      const h = withPRs(raw), prs = h.filter(p => p.pr || p === h[0]), cur = h.reduce((b, p) => (p.e1rm > b.e1rm ? p : b), h[0]);
      const prev = h.filter(p => p.e1rm < cur.e1rm && p.date < cur.date).reduce((b, p) => (!b || p.e1rm > b.e1rm ? p : b), null);
      return { name, e1rm: cur.e1rm, weight: cur.weight, reps: cur.reps, date: cur.date, prevE1rm: prev ? prev.e1rm : null, sessions: h.length };
    }).filter(Boolean).sort((a, b) => b.e1rm - a.e1rm);
  }

  /** { 'YYYY-MM-DD (week start)': { MUSCLE: sets } } for the last `weeks` weeks ending at today's week. muscleOf(name) -> group. */
  function weeklySets(logs, muscleOf, today, weeks = 8) {
    const first = addDays(weekStart(today), -(weeks - 1) * 7), out = {};
    for (let i = 0; i < weeks; i++) out[addDays(first, i * 7)] = {};
    logs.forEach(l => { const w = weekStart(l.date); if (!w || !out[w]) return; (l.exercises || []).forEach(ex => { const n = clean(ex.sets).length; if (n) { const m = muscleOf(up(ex.name)) || 'OTHER'; out[w][m] = (out[w][m] || 0) + n; } }); });
    return out;
  }

  const api = { validDate, e1rm, sessionVolume, sessionSets, exerciseNames, history, withPRs, plateau, prBoard, weeklySets, addDays, weekStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Grid = root.Grid || {}).gym = api;
})(typeof window !== 'undefined' ? window : globalThis);
