const { verifyToken } = require('../lib/jwt');
const db = require('../lib/db');

/**
 * requireAuth middleware
 * Reads the JWT from either:
 *   1. httpOnly cookie (grid_token) — standard browser use
 *   2. Authorization: Bearer <token> header — for API testing / mobile
 *
 * Attaches the full user object to req.user.
 */
async function requireAuth(req, res, next) {
  try {
    // 1. Try cookie first
    let token = req.cookies?.grid_token;

    // 2. Fall back to Authorization header
    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify the token
    const payload = verifyToken(token);

    // Load the user from DB (ensures they still exist and aren't deleted)
    const user = await db.user.findUnique({
      where: { id: payload.id },
      select: {
        id:    true,
        email: true,
        name:  true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
