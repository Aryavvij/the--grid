const GRID = require('path').resolve(__dirname, '..');
// Stub auth + db, mount the real routers, hit them over HTTP.
const path = require('path'), root = GRID + '/grid-backend/src/';
const stubAuth = path.join(root, 'middleware/auth.js'), stubDb = path.join(root, 'lib/db.js');
const calls = [];
const table = (name) => new Proxy({}, { get: (_, m) => async (arg) => { calls.push([name, m, arg]); return m === 'findMany' ? [] : m === 'createMany' ? { count: (arg.data || []).length - 1 } : m === 'findFirst' ? (arg && arg.where && arg.where.id === 'mine' ? { id: 'mine' } : null) : m === 'findUnique' ? null : { id: 'x', ...(arg && (arg.data || arg.create) || {}) }; } });
require.cache[stubAuth] = { id: stubAuth, filename: stubAuth, loaded: true, exports: { requireAuth: (req, res, next) => { req.user = { id: 'u1' }; next(); } } };
require.cache[stubDb] = { id: stubDb, filename: stubDb, loaded: true, exports: new Proxy({}, { get: (_, n) => table(n) }) };
const express = require(root + '../node_modules/express');
const app = express(); app.use(express.json());
app.use('/api/runs', require(root + 'routes/runs')); app.use('/api/nutrition', require(root + 'routes/nutrition')); app.use('/api/resume', require(root + 'routes/resume'));
const srv = app.listen(4012, async () => {
  const j = (p, m, b) => fetch('http://localhost:4012' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => [r.status, await r.json().catch(() => ({}))]);
  const t = (n, ok) => { console.log(ok ? 'ok  ' : 'FAIL', n); if (!ok) process.exitCode = 1; };
  const run = { date: '2026-09-01', startTime: '2026-09-01T06:30:00Z', distanceM: 5000, movingSec: 1700, fileHash: 'abcdef123456', sourceFormat: 'gpx' };
  let r;
  r = await j('/api/nutrition/presets', 'POST', { code: 's1', name: 'Protein Bar', calories: 210, protein: 20, carbs: 22, fat: 7 }); t('preset create uppercases code', r[0] === 201 && calls.at(-1)[2].data.code === 'S1');
  r = await j('/api/nutrition/presets', 'POST', { code: 'bad code!', name: 'x', calories: 1 }); t('preset rejects bad code', r[0] === 400);
  r = await j('/api/nutrition/presets', 'POST', { code: 'S9', name: 'x', calories: -5 }); t('preset rejects negative kcal', r[0] === 400);
  r = await j('/api/nutrition/log-preset', 'POST', { code: 'zz', date: '2026-10-05' }); t('log-preset unknown code -> 404 PRESET_NOT_FOUND', r[0] === 404 && r[1].code === 'PRESET_NOT_FOUND');
  r = await j('/api/nutrition/log-preset', 'POST', { code: 'S1', qty: 99, date: '2026-10-05' }); t('log-preset rejects qty 99', r[0] === 400);
  r = await j('/api/nutrition/log-preset', 'POST', { code: 'S1', date: 'today' }); t('log-preset rejects bad date', r[0] === 400);
  r = await j('/api/nutrition/targets', 'PUT', { calories: 300, protein: 1, carbs: 1, fat: 1 }); t('targets rejects <800 kcal', r[0] === 400);
  r = await j('/api/nutrition/water/2026-10-05', 'PUT', { ml: 2500 }); t('water upsert ok', r[0] === 200);
  r = await j('/api/runs/import', 'POST', { runs: [run, run] }); t('runs import ok + duplicates counted', r[0] === 201 && r[1].imported === 1 && r[1].duplicates === 1);
  r = await j('/api/runs/import', 'POST', { runs: [{ ...run, sourceFormat: 'zip' }] }); t('runs import rejects bad format', r[0] === 400);
  r = await j('/api/runs/import', 'POST', { runs: [] }); t('runs import rejects empty', r[0] === 400);
  r = await j('/api/runs/import', 'POST', { runs: [{ ...run, avgHr: 999 }] }); t('runs import rejects hr 999', r[0] === 400);
  r = await j('/api/runs/abc', 'GET'); t('run detail 404 when not owned/missing', r[0] === 404);
  // edit a run / edit a food entry (ownership + validation)
  r = await j('/api/runs/mine', 'PUT', { name: '  Easy 5K  ', gear: 'Pegasus 40' }); t('run rename + gear ok, trimmed', r[0] === 200 && calls.at(-1)[2].data.name === 'Easy 5K' && calls.at(-1)[2].data.gear === 'Pegasus 40');
  r = await j('/api/runs/mine', 'PUT', { distanceM: 99999, startTime: '2020-01-01T00:00:00Z' }); t('run edit cannot touch file-derived fields', r[0] === 400);
  r = await j('/api/runs/mine', 'PUT', { name: '' }); t('empty name clears to null', r[0] === 200 && calls.at(-1)[2].data.name === null);
  r = await j('/api/runs/other', 'PUT', { name: 'x' }); t("cannot edit someone else's run", r[0] === 404);
  r = await j('/api/runs/mine', 'PUT', { name: 'x'.repeat(300) }); t('run name length capped', r[0] === 400);
  r = await j('/api/nutrition/log/mine', 'PUT', { qty: 2, calories: 420, protein: 40 }); t('food edit ok', r[0] === 200 && calls.at(-1)[2].data.qty === 2 && calls.at(-1)[2].where.id === 'mine');
  r = await j('/api/nutrition/log/mine', 'PUT', { calories: -5 }); t('food edit rejects negative kcal', r[0] === 400);
  r = await j('/api/nutrition/log/mine', 'PUT', { date: '2020-01-01', userId: 'attacker' }); t('food edit cannot change date or owner (stripped, then empty)', r[0] === 400);
  r = await j('/api/nutrition/log/mine', 'PUT', { slot: 'brunch' }); t('food edit rejects bad meal slot', r[0] === 400);
  r = await j('/api/nutrition/log/other', 'PUT', { qty: 1 }); t("cannot edit someone else's entry", r[0] === 404);
  // resume: whole-blob replace, header/skills ride along as __profile
  r = await j('/api/resume', 'PUT', { sections: { internships: [{ name: 'Intern', org: 'Acme', location: 'Pune', fullDesc: 'a\nb', onPdf: true }], __profile: { name: 'A', skills: { languages: 'Go' } } } });
  t('resume save keeps entries and __profile', r[0] === 200 && calls.at(-1)[2].update.sections.internships[0].org === 'Acme' && calls.at(-1)[2].update.sections.__profile.skills.languages === 'Go');
  r = await j('/api/resume', 'PUT', {}); t('resume save rejects missing sections', r[0] === 400);
  r = await j('/api/resume', 'PUT', { sections: { projects: 'nope' } }); t('resume save rejects non-list section', r[0] === 400);
  // API responses must not be cacheable (private, per-user data)
  const app2 = require(GRID + '/grid-backend/node_modules/express')(); app2.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }); app2.get('/api/x', (q, r) => r.json({ ok: 1 }));
  const srv2 = app2.listen(4016); const hr = await fetch('http://localhost:4016/api/x'); t('api responses carry Cache-Control: no-store', hr.headers.get('cache-control') === 'no-store'); srv2.close();
  srv.close();
});
