const express  = require('express');
const bcrypt   = require('bcryptjs');
const passport = require('passport');
const db       = require('../lib/db');
const { signToken, setTokenCookie, clearTokenCookie } = require('../lib/jwt');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { validate, registerSchema, loginSchema } = require('../middleware/validate');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issueTokenAndRespond(res, user) {
  const token = signToken({ id: user.id, email: user.email });
  setTokenCookie(res, token);
  return res.json({
    user: {
      id:    user.id,
      email: user.email,
      name:  user.name,
    },
  });
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    // email/password/name already validated + normalized by validate(registerSchema)
    const { email, password, name } = req.body;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        email,
        name:  name || null,
        passwordHash,
      },
    });

    return issueTokenAndRespond(res, user);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    // email/password already validated + normalized by validate(loginSchema)
    const { email, password } = req.body;

    const user = await db.user.findUnique({ where: { email } });

    // Constant-time comparison even if user not found (prevents timing attacks)
    const dummyHash = '$2a$12$invalidhashfortimingprotectiononly';
    const valid = user
      ? await bcrypt.compare(password, user.passwordHash || dummyHash)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'This account uses Google sign-in — use "Continue with Google" instead' });
    }

    return issueTokenAndRespond(res, user);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/google ─────────────────────────────────────────────────────

router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

// ─── GET /api/auth/google/callback ───────────────────────────────────────────

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}?auth=error` }),
  (req, res) => {
    // Passport calls done(null, user) → req.user is the user object
    const token = signToken({ id: req.user.id, email: req.user.email });
    setTokenCookie(res, token);

    // Redirect back to the frontend — it will call /api/auth/me to get user info
    res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
  }
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  clearTokenCookie(res);
  res.json({ message: 'Logged out' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Returns the current logged-in user. Frontend calls this on load.

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: {
      id:    req.user.id,
      email: req.user.email,
      name:  req.user.name,
    },
  });
});

module.exports = router;
