const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES_IN || '30d';

if (!SECRET) {
  throw new Error('JWT_SECRET is not set in environment variables');
}

/**
 * Sign a JWT for a user.
 * @param {object} payload  — usually { id, email }
 * @returns {string} signed token
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws if expired or invalid.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

/**
 * Set the JWT as an httpOnly cookie on the response.
 * httpOnly = JS can't read it → immune to XSS.
 */
function setTokenCookie(res, token) {
  res.cookie('grid_token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  });
}

/**
 * Clear the auth cookie.
 */
function clearTokenCookie(res) {
  res.clearCookie('grid_token', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
}

module.exports = { signToken, verifyToken, setTokenCookie, clearTokenCookie };
