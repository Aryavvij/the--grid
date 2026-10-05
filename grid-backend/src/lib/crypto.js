const crypto = require('crypto');

// ─── AES-256-GCM for stored OAuth refresh tokens ──────────────────────────────
// Key: HEALTH_TOKEN_KEY = 64 hex chars (32 bytes). Generate: openssl rand -hex 32
// Format: v1.<iv b64>.<tag b64>.<ciphertext b64>

function key() {
  const hex = process.env.HEALTH_TOKEN_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('HEALTH_TOKEN_KEY must be 64 hex characters');
  return Buffer.from(hex, 'hex');
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

function decrypt(blob) {
  const [v, iv, tag, ct] = String(blob).split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised token format');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
