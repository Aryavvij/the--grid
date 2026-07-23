// ─── Metric Engine core ───────────────────────────────────────────────────────
// Pure functions only — no DB access, so they are trivially testable and are the
// single definition of "did I do it" shared by every route.

/**
 * Normalize a raw logged value to a 0–1.25 completion score.
 * Capped at 1.25 so overshoot reads as a shimmer without breaking the colour scale.
 */
function scoreFor(type, value, target) {
  const v = Number(value) || 0;
  switch (type) {
    case 'BINARY':
    case 'DERIVED':
      return v > 0 ? 1 : 0;
    case 'SCALE':
      // 1–5 tap
      return Math.max(0, Math.min(v / 5, 1));
    case 'QUANTITY':
    case 'DURATION':
      if (!target || target <= 0) return v > 0 ? 1 : 0;
      return Math.max(0, Math.min(v / target, 1.25));
    default:
      return 0;
  }
}

/** A day counts toward a streak at half credit or better. */
const STREAK_THRESHOLD = 0.5;

/** Days per perfect run that earn one repair token, and the ceiling on banked tokens. */
const TOKEN_EARN_EVERY = 7;
const TOKEN_MAX = 2;

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return ymd(d);
}

/** JS day index (0=Sun..6=Sat) for a YYYY-MM-DD string, timezone-independent. */
function dayIndex(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

/**
 * Is this metric scheduled on this date?
 * An empty/absent targetDays means "every day".
 * Unscheduled days are SKIPPED by the streak walk — never streak-breaking,
 * so a 3-day-a-week split can still hold a streak.
 */
function isScheduled(def, dateStr) {
  const days = def && def.targetDays;
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.includes(dayIndex(dateStr));
}

/**
 * Walk backwards from `today` computing the current streak.
 * Returns { current, best, tokens, repairsUsed }.
 *
 * Rules:
 *  - score >= 0.5 continues the streak (partial credit counts)
 *  - unscheduled days are skipped entirely
 *  - a REPAIR-sourced log already sits at 0.5, so it continues the run and is
 *    rendered as a hollow ring by the client
 */
function resolveStreak(def, logs, today) {
  const byDate = new Map();
  for (const l of logs) byDate.set(l.loggedDate, l);

  const todayStr = today || ymd(new Date());

  // Current streak — walk back from today.
  let current = 0;
  let cursor = todayStr;
  // Today not yet logged shouldn't zero the streak; start from yesterday in that case.
  const todayLog = byDate.get(todayStr);
  if (!todayLog || todayLog.score < STREAK_THRESHOLD) {
    if (isScheduled(def, todayStr) && todayLog && todayLog.score < STREAK_THRESHOLD) {
      // explicitly failed today → streak is 0
      return { current: 0, best: bestRun(def, byDate), tokens: tokenBalance(logs), repairsUsed: repairs(logs) };
    }
    cursor = addDays(todayStr, -1);
  }

  // Guard the walk so a sparse history can't spin forever.
  for (let i = 0; i < 3650; i++) {
    if (!isScheduled(def, cursor)) { cursor = addDays(cursor, -1); continue; }
    const log = byDate.get(cursor);
    if (log && log.score >= STREAK_THRESHOLD) {
      current++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  return {
    current,
    best: bestRun(def, byDate),
    tokens: tokenBalance(logs),
    repairsUsed: repairs(logs),
  };
}

function bestRun(def, byDate) {
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return 0;
  let best = 0, run = 0, cursor = dates[0];
  const last = dates[dates.length - 1];
  for (let i = 0; i < 3650 && cursor <= last; i++) {
    if (isScheduled(def, cursor)) {
      const log = byDate.get(cursor);
      if (log && log.score >= STREAK_THRESHOLD) { run++; if (run > best) best = run; }
      else run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

function repairs(logs) {
  return logs.filter(l => l.source === 'REPAIR').length;
}

/**
 * Repair tokens are DERIVED, never stored:
 *   earned  = floor(qualifying days / 7)
 *   balance = min(earned - spent, TOKEN_MAX)
 * A spend is just a MetricLog with source REPAIR, so the ledger is the log table.
 */
function tokenBalance(logs) {
  const qualifying = logs.filter(l => l.source !== 'REPAIR' && l.score >= 1).length;
  const earned = Math.floor(qualifying / TOKEN_EARN_EVERY);
  const spent = repairs(logs);
  return Math.max(0, Math.min(earned - spent, TOKEN_MAX));
}

/**
 * Fragility score — surfaces the ONE metric most likely to break today,
 * instead of showing every metric at equal weight (blueprint UX vector).
 * Higher = more at risk.
 */
function fragility(def, logs, today) {
  const todayStr = today || ymd(new Date());
  const byDate = new Map(logs.map(l => [l.loggedDate, l]));

  // Capped at 30: a never-logged metric is genuinely at risk, but an uncapped
  // walk makes it score ~366 and permanently drown out every real signal.
  const MAX_LOOKBACK = 30;
  let sinceLast = 0;
  let cursor = todayStr;
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const log = byDate.get(cursor);
    if (log && log.score >= STREAK_THRESHOLD) break;
    if (isScheduled(def, cursor)) sinceLast++;
    cursor = addDays(cursor, -1);
  }

  const { current } = resolveStreak(def, logs, todayStr);

  // Completion rate over SCHEDULED days in the window — not over rows that happen
  // to exist. A metric you silently stopped logging must not score a perfect rate.
  let scheduledDays = 0, hits = 0;
  let d = todayStr;
  for (let i = 0; i < 14; i++) {
    if (isScheduled(def, d)) {
      scheduledDays++;
      const log = byDate.get(d);
      if (log && log.score >= STREAK_THRESHOLD) hits++;
    }
    d = addDays(d, -1);
  }
  const rate = scheduledDays ? hits / scheduledDays : 0;

  return (1 - rate) * (current + 1) * (sinceLast + 1);
}

/** Today's date string in the user's timezone (falls back to UTC). */
function todayInZone(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return ymd(new Date());
  }
}

module.exports = {
  scoreFor,
  resolveStreak,
  fragility,
  tokenBalance,
  isScheduled,
  todayInZone,
  ymd,
  addDays,
  STREAK_THRESHOLD,
  TOKEN_EARN_EVERY,
  TOKEN_MAX,
};
