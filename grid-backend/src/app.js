require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const passport     = require('passport');
const { globalLimiter } = require('./middleware/security');

const app = express();

// Behind Vercel / Railway proxies — trust the first hop so req.ip reflects the
// real client (required for correct rate limiting). '1' (not true) avoids the
// permissive-trust-proxy footgun where X-Forwarded-For could be spoofed.
app.set('trust proxy', 1);

// ─── Passport config ──────────────────────────────────────────────────────────
require('./lib/passport');

// ─── Security headers ─────────────────────────────────────────────────────────
// CORP set to cross-origin: this is a JSON API consumed by a frontend on a
// different origin; same-origin (helmet's default) would be needlessly strict.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── Middleware ───────────────────────────────────────────────────────────────
// Allow multiple origins — comma-separated FRONTEND_URL env var
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
// Body size caps — block oversized-payload DoS (1mb is well above any text payload).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// Global rate limit — applied to every route below. At 300/15min the Railway
// /health probe (~2/min) sits far under the cap, so monitoring is unaffected.
app.use(globalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/profile',  require('./routes/profile'));
app.use('/api/habits',   require('./routes/habits'));   // legacy — superseded by /api/metrics
app.use('/api/metrics',  require('./routes/metrics'));
app.use('/api/planning', require('./routes/planning'));
app.use('/api/gym',      require('./routes/gym'));
app.use('/api/finance',  require('./routes/finance'));
app.use('/api/calendar', require('./routes/calendar'));
// Public by design — token in the URL is the credential (iOS cannot send one).
app.use('/api/feed',     require('./routes/feed'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/resume',   require('./routes/resume'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'grid-backend', ts: new Date().toISOString() });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
