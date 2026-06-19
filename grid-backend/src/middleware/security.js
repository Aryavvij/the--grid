const rateLimit = require('express-rate-limit');

/**
 * Rate limiters — brute-force / scraping / accidental-loop defense.
 *
 * NOTE on serverless (Vercel): the default in-memory store is per-instance and
 * resets on cold starts, so limits are best-effort there. For hard guarantees
 * across instances, swap in a shared store (e.g. rate-limit-redis + Upstash).
 * On Railway (single long-lived process) the in-memory store is fully effective.
 */

// Generous global cap — protects every endpoint without bothering real users.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down and try again shortly.' },
});

// Strict cap on unauthenticated auth endpoints — credential-stuffing defense.
// Only FAILED attempts count, so a legit user logging in repeatedly is never locked.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts — please wait 15 minutes before retrying.' },
});

module.exports = { globalLimiter, authLimiter };
