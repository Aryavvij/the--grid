const calc = require('./healthCalc');

// ─── Google Health API v4 client + mappers ────────────────────────────────────
// Field names follow Google's published proto (JSON = camelCase, int64 = string).
// Payload SHAPES are not yet confirmed against a live account: every mapper reads
// defensively (pick()) so Phase 1's probe output (spikes/google-health/raw/*.json)
// can pin them down without a rewrite.

const BASE      = 'https://health.googleapis.com/v4/users/me/dataTypes';
const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE_BASE = 'https://www.googleapis.com/auth/googlehealth';
const SCOPES = ['activity_and_fitness', 'health_metrics_and_measurements', 'sleep'].map(s => `${SCOPE_BASE}.${s}.readonly`);

// ─── OAuth ────────────────────────────────────────────────────────────────────

function authUrl(state) {
  const { GH_CLIENT_ID, GH_REDIRECT_URI } = process.env;
  if (!GH_CLIENT_ID || !GH_REDIRECT_URI) throw new Error('GH_CLIENT_ID / GH_REDIRECT_URI not configured');
  return AUTH_URL + '?' + new URLSearchParams({
    client_id: GH_CLIENT_ID, redirect_uri: GH_REDIRECT_URI, response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state,
  });
}

async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GH_CLIENT_ID, client_secret: process.env.GH_CLIENT_SECRET, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || 'token request failed'); e.code = j.error; throw e; }
  return j;
}
const exchangeCode   = (code) => tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: process.env.GH_REDIRECT_URI });
const refreshAccess  = (refreshToken) => tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function api(accessToken, path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error?.message || `Google Health ${r.status}`); e.status = r.status; throw e; }
  return j;
}

/** List every data point of a type (follows pageToken, capped). */
async function listAll(accessToken, type, { pageSize = 100, maxPages = 10 } = {}) {
  const out = []; let token;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ pageSize: String(pageSize), ...(token && { pageToken: token }) });
    const j = await api(accessToken, `/${type}/dataPoints?${q}`);
    out.push(...(j.dataPoints || []));
    token = j.nextPageToken; if (!token) break;
  }
  return out;
}

/** Civil-day rollup; the API caps ranges at 90 days (14 for heart-rate/calories types), so chunk. */
async function dailyRollUp(accessToken, type, startDate, endDate, maxDays = 90) {
  const out = []; let from = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (from <= end) {
    const to = new Date(Math.min(end.getTime(), from.getTime() + (maxDays - 1) * 86400000));
    const civil = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
    const j = await api(accessToken, `/${type}/dataPoints:dailyRollUp`, { method: 'POST', body: JSON.stringify({ range: { start: civil(from), end: civil(to) }, windowSizeDays: 1 }) });
    out.push(...(j.rollupDataPoints || []));
    from = new Date(to.getTime() + 86400000);
  }
  return out;
}

// ─── Mappers (pure) ───────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; };
const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return null; };
const civilToStr = (d) => (d && d.year ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : null);
const offsetSec = (s) => (s ? parseInt(String(s), 10) || 0 : 0);

/** Local calendar date of an RFC3339 instant given a "-14400s" style UTC offset. */
function localDate(iso, utcOffset) {
  const d = new Date(new Date(iso).getTime() + offsetSec(utcOffset) * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const body = (dp, ...keys) => pick(dp, ...keys) || {};

function mapRestingHr(dp) { const b = body(dp, 'dailyRestingHeartRate', 'restingHeartRate'); return { date: civilToStr(b.date), restingHr: num(b.beatsPerMinute) }; }
function mapHrv(dp)       { const b = body(dp, 'dailyHeartRateVariability', 'heartRateVariability'); return { date: civilToStr(b.date), hrvMs: num(b.averageHeartRateVariabilityMilliseconds) }; }
function mapSpo2(dp)      { const b = body(dp, 'dailyOxygenSaturation', 'oxygenSaturation'); return { date: civilToStr(b.date), spo2Avg: num(b.averagePercentage), spo2Min: num(b.lowerBoundPercentage) }; }
function mapResp(dp)      { const b = body(dp, 'dailyRespiratoryRate', 'respiratoryRate'); return { date: civilToStr(b.date), breathingRate: num(b.breathsPerMinute) }; }

/** Rollup point -> { date, value } using the documented per-type value field. */
function mapRollup(rp, field, valueKey) {
  const date = civilToStr(rp.civilStartTime);
  return { date, value: num(pick(rp[field] || {}, valueKey)) };
}

/** Active zone minutes rollup: field names for the zone sums are not documented, match by name. */
function mapAzmRollup(rp) {
  const b = rp.activeZoneMinutes || {}, z = { fatBurn: 0, cardio: 0, peak: 0 };
  for (const [k, v] of Object.entries(b)) {
    const n = num(v); if (n == null) continue;
    if (/fat/i.test(k)) z.fatBurn += n; else if (/cardio/i.test(k)) z.cardio += n; else if (/peak/i.test(k)) z.peak += n;
  }
  return { date: civilToStr(rp.civilStartTime), zones: z, azm: z.fatBurn + z.cardio * 1 + z.peak * 1 };
}

const STAGE = { LIGHT: 'light', DEEP: 'deep', REM: 'rem', AWAKE: 'awake', WAKE: 'awake', ASLEEP: 'light', RESTLESS: 'awake' };

function mapSleep(dp) {
  const b = body(dp, 'sleep'); const iv = b.interval || {};
  if (!iv.startTime || !iv.endTime) return null;
  const stages = (pick(b, 'sleepStages', 'stages') || []).map(s => ({
    type: STAGE[String(pick(s, 'stage', 'type') || '').toUpperCase()] || 'light',
    start: s.interval?.startTime, end: s.interval?.endTime,
  })).filter(s => s.start && s.end);
  const mins = { light: 0, deep: 0, rem: 0, awake: 0 };
  stages.forEach(s => { mins[s.type] += Math.round((new Date(s.end) - new Date(s.start)) / 60000); });
  const inBed = Math.round((new Date(iv.endTime) - new Date(iv.startTime)) / 60000);
  const asleep = stages.length ? mins.light + mins.deep + mins.rem : inBed;
  const row = {
    date: localDate(iv.endTime, iv.endUtcOffset), startTime: iv.startTime, endTime: iv.endTime,
    minutesAsleep: asleep, minutesAwake: stages.length ? mins.awake : null,
    lightMin: stages.length ? mins.light : null, deepMin: stages.length ? mins.deep : null, remMin: stages.length ? mins.rem : null,
    efficiency: inBed ? +(100 * asleep / inBed).toFixed(1) : null, stages: stages.length ? stages : null,
  };
  row.score = calc.sleepScore(row);
  return row;
}

/** Keep the longest session per wake-up date (drops naps). */
function mainSleepPerDate(rows) {
  const best = {}; rows.filter(Boolean).forEach(r => { if (!best[r.date] || r.minutesAsleep > best[r.date].minutesAsleep) best[r.date] = r; });
  return Object.values(best);
}

/** Merge per-metric { date, ...fields } fragments into one HealthDaily-shaped row per date. */
function mergeDaily(fragments) {
  const byDate = {};
  for (const f of fragments) {
    if (!f || !f.date) continue;
    const row = (byDate[f.date] = byDate[f.date] || { date: f.date });
    for (const [k, v] of Object.entries(f)) if (k !== 'date' && v != null) row[k] = v;
  }
  return Object.values(byDate);
}

/** Fill GRID-calculated fields (cardio load, readiness) using up to 28 prior days of context. */
function derive(rows, sleepByDate) {
  const asc = rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  asc.forEach((r, i) => {
    r.cardioLoad = r.hrZones ? calc.cardioLoad(r.hrZones) : r.cardioLoad ?? null;
    const win = asc.slice(Math.max(0, i - 28), i + 1), avg = (k) => { const v = win.map(x => x[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    r.readiness = calc.readiness({ hrv: r.hrvMs, hrvBase: avg('hrvMs'), rhr: r.restingHr, rhrBase: avg('restingHr'), sleepScore: sleepByDate[r.date]?.score ?? null, loadRatio: calc.loadRatio(asc.slice(0, i + 1).map(x => x.cardioLoad).filter(x => x != null)) });
  });
  return asc;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

const ROLLUPS = [
  ['steps', 'steps', 'countSum', 'steps'], ['distance', 'distance', 'metersSum', 'distanceM'],
  ['total-calories', 'totalCalories', 'kilocaloriesSum', 'caloriesTotal'], ['active-minutes', 'activeMinutes', 'durationMinutesSum', 'activeMinutes'],
];

/** Pull `days` days of data and return { daily, sleep } rows ready to upsert. Each metric fails independently. */
async function pullRange(accessToken, days = 7, today = new Date()) {
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const frags = [], errors = {};
  const inRange = (r) => r.date && r.date >= start && r.date <= end;
  const tryRun = async (name, fn) => { try { await fn(); } catch (e) { errors[name] = e.message; } };

  await Promise.all([
    tryRun('resting-hr', async () => (await listAll(accessToken, 'daily-resting-heart-rate')).map(mapRestingHr).filter(inRange).forEach(f => frags.push(f))),
    tryRun('hrv', async () => (await listAll(accessToken, 'daily-heart-rate-variability')).map(mapHrv).filter(inRange).forEach(f => frags.push(f))),
    tryRun('spo2', async () => (await listAll(accessToken, 'daily-oxygen-saturation')).map(mapSpo2).filter(inRange).forEach(f => frags.push(f))),
    tryRun('breathing', async () => (await listAll(accessToken, 'daily-respiratory-rate')).map(mapResp).filter(inRange).forEach(f => frags.push(f))),
    ...ROLLUPS.map(([type, field, vk, out]) => tryRun(type, async () => (await dailyRollUp(accessToken, type, start, end, type === 'total-calories' ? 14 : 90)).forEach(rp => { const m = mapRollup(rp, field, vk); if (m.date) frags.push({ date: m.date, [out]: m.value }); }))),
    tryRun('active-zone-minutes', async () => (await dailyRollUp(accessToken, 'active-zone-minutes', start, end)).forEach(rp => { const m = mapAzmRollup(rp); if (m.date) frags.push({ date: m.date, hrZones: m.zones, azmMinutes: m.azm }); })),
  ]);

  let sleep = [];
  await tryRun('sleep', async () => { sleep = mainSleepPerDate((await listAll(accessToken, 'sleep')).map(mapSleep)).filter(inRange); });

  const sleepByDate = Object.fromEntries(sleep.map(s => [s.date, s]));
  const merged = mergeDaily(frags).map(r => { const { activeMinutes, ...rest } = r; return rest; });
  return { daily: derive(merged, sleepByDate), sleep, errors };
}

module.exports = { SCOPES, authUrl, exchangeCode, refreshAccess, listAll, dailyRollUp, pullRange,
  mapRestingHr, mapHrv, mapSpo2, mapResp, mapRollup, mapAzmRollup, mapSleep, mainSleepPerDate, mergeDaily, derive, localDate };
