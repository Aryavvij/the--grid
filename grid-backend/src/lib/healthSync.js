const db  = require('./db');
const gh  = require('./googleHealth');
const { encrypt, decrypt } = require('./crypto');

// ─── Sync one user: refresh token -> pull -> upsert -> record status ──────────

async function saveToken(userId, refreshToken, scopes) {
  const refreshTokenEnc = encrypt(refreshToken);
  return db.healthToken.upsert({
    where: { userId }, update: { refreshTokenEnc, scopes, lastSyncStatus: 'connected', lastSyncError: null },
    create: { userId, refreshTokenEnc, scopes, lastSyncStatus: 'connected' },
  });
}

async function syncUser(userId, days = 7) {
  const tok = await db.healthToken.findUnique({ where: { userId } });
  if (!tok) { const e = new Error('Google Health is not connected'); e.status = 409; throw e; }

  let access;
  try {
    const t = await gh.refreshAccess(decrypt(tok.refreshTokenEnc));
    access = t.access_token;
    // Google may rotate the refresh token: always keep the newest one.
    if (t.refresh_token) await db.healthToken.update({ where: { userId }, data: { refreshTokenEnc: encrypt(t.refresh_token) } });
  } catch (e) {
    const reauth = e.code === 'invalid_grant';
    await db.healthToken.update({ where: { userId }, data: { lastSyncAt: new Date(), lastSyncStatus: reauth ? 'reauth_required' : 'error', lastSyncError: e.message.slice(0, 300) } });
    const err = new Error(reauth ? 'Google access expired or revoked: reconnect Google Health' : e.message); err.status = reauth ? 401 : 502; throw err;
  }

  const { daily, sleep, errors } = await gh.pullRange(access, days);

  for (const d of daily) {
    const { date, ...fields } = d;
    await db.healthDaily.upsert({ where: { userId_date: { userId, date } }, update: { ...fields, source: 'google_health', syncedAt: new Date() }, create: { ...fields, userId, date, source: 'google_health' } });
  }
  for (const s of sleep) {
    const { date, ...fields } = s;
    const data = { ...fields, date, startTime: new Date(s.startTime), endTime: new Date(s.endTime), source: 'google_health' };
    await db.healthSleep.upsert({ where: { userId_startTime: { userId, startTime: data.startTime } }, update: data, create: { ...data, userId } });
  }

  const failed = Object.keys(errors);
  await db.healthToken.update({ where: { userId }, data: {
    lastSyncAt: new Date(), lastSyncStatus: failed.length ? (daily.length || sleep.length ? 'partial' : 'error') : 'ok',
    lastSyncError: failed.length ? failed.map(k => `${k}: ${errors[k]}`).join(' | ').slice(0, 500) : null } });
  return { days: daily.length, sleepNights: sleep.length, errors };
}

module.exports = { saveToken, syncUser };
