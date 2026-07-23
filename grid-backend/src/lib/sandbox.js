const { scoreFor } = require('./metrics');

// ─── Sandbox seeding ──────────────────────────────────────────────────────────
// A sandbox account is a REAL account with real rows. That is the whole point:
// demo mode stops being a second code path and becomes ordinary authenticated
// usage, so every feature works identically without an `isDemo` branch.

const SANDBOX_TTL_DAYS = 30;

const SEED_METRICS = [
  { name: 'DEEP WORK',  type: 'DURATION', unit: 'min', target: 90,   sortOrder: 0 },
  { name: 'READ',       type: 'BINARY',                              sortOrder: 1 },
  { name: 'HYDRATE',    type: 'QUANTITY', unit: 'ml',  target: 3000, sortOrder: 2 },
  { name: 'TRAIN',      type: 'BINARY',   targetDays: [1, 3, 5],     sortOrder: 3 },
  { name: 'SLEEP',      type: 'SCALE',                               sortOrder: 4 },
];

const SEED_CATEGORIES = [
  { name: 'HOUSING',   type: 'expense', budgetAmount: 12000, sortOrder: 0 },
  { name: 'FOOD',      type: 'expense', budgetAmount: 6000,  sortOrder: 1 },
  { name: 'TRANSPORT', type: 'expense', budgetAmount: 2500,  sortOrder: 2 },
  { name: 'ACADEMIC',  type: 'expense', budgetAmount: 3000,  sortOrder: 3 },
  { name: 'INCOME',    type: 'income',  budgetAmount: 25000, sortOrder: 4 },
];

const SEED_PROJECTS = [
  { title: 'PORTFOLIO SITE',   description: 'CAREER_SYNC',   status: 'active',    priority: 'high',   sortOrder: 0 },
  { title: 'THESIS DRAFT',     description: 'ACADEMIC_TRACK', status: 'active',   priority: 'high',   sortOrder: 1 },
  { title: 'HOME LAB',         description: 'PERSONAL_OPT',  status: 'on-hold',   priority: 'low',    sortOrder: 2 },
];

const SEED_SPLIT_DAYS = [
  { title: 'PUSH', muscles: ['CHEST', 'SHOULDERS', 'TRICEPS'], exercises: ['Bench Press', 'Overhead Press', 'Dips'] },
  { title: 'PULL', muscles: ['BACK', 'BICEPS'],                exercises: ['Deadlift', 'Pull-ups', 'Barbell Row'] },
  { title: 'LEGS', muscles: ['QUADS', 'HAMSTRINGS', 'CALVES'], exercises: ['Squat', 'Romanian Deadlift', 'Calf Raise'] },
  { title: 'REST', muscles: [], exercises: [] },
  { title: 'PUSH', muscles: ['CHEST', 'SHOULDERS', 'TRICEPS'], exercises: ['Incline Press', 'Lateral Raise'] },
  { title: 'PULL', muscles: ['BACK', 'BICEPS'],                exercises: ['Lat Pulldown', 'Face Pull'] },
  { title: 'REST', muscles: [], exercises: [] },
];

function ymd(d) { return d.toISOString().slice(0, 10); }

/**
 * Seed a believable 21-day history so charts, streaks and the heat-wall have
 * something real to render immediately. Deterministic-ish per metric so the
 * demo looks considered rather than random noise.
 */
function buildMetricLogs(defs, userId) {
  const logs = [];
  const today = new Date();

  for (const def of defs) {
    const targetDays = Array.isArray(def.targetDays) ? def.targetDays : null;

    for (let back = 20; back >= 0; back--) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      if (targetDays && !targetDays.includes(d.getDay())) continue;

      // Skip a few days so streaks and the at-risk tile are meaningful.
      const skip = (back % 7 === 3) || (def.name === 'READ' && back < 4);
      if (skip) continue;

      let value;
      switch (def.type) {
        case 'BINARY':   value = 1; break;
        case 'SCALE':    value = 3 + ((back % 3) === 0 ? 1 : 0); break;
        case 'DURATION': value = def.target * (back % 4 === 0 ? 0.6 : 1); break;
        case 'QUANTITY': value = def.target * (back % 5 === 0 ? 0.5 : 1); break;
        default:         value = 1;
      }

      logs.push({
        defId: def.id,
        userId,
        loggedDate: ymd(d),
        value,
        targetAtLog: def.target ?? null,
        score: scoreFor(def.type, value, def.target),
        source: 'MANUAL',
      });
    }
  }
  return logs;
}

/**
 * Create every seed row for a fresh sandbox user.
 * Runs inside a transaction so a partial sandbox can never exist.
 */
async function seedSandbox(tx, userId) {
  await tx.userProfile.create({
    data: { userId, occupation: 'Student', timezone: 'Asia/Kolkata' },
  });

  await tx.metricDef.createMany({
    data: SEED_METRICS.map(m => ({ ...m, userId })),
  });
  const defs = await tx.metricDef.findMany({ where: { userId } });

  const logs = buildMetricLogs(defs, userId);
  if (logs.length) await tx.metricLog.createMany({ data: logs });

  await tx.budgetCategory.createMany({
    data: SEED_CATEGORIES.map(c => ({ ...c, userId })),
  });

  await tx.project.createMany({
    data: SEED_PROJECTS.map(p => ({ ...p, userId })),
  });

  await tx.gymSplit.create({
    data: { userId, name: 'PUSH / PULL / LEGS', days: SEED_SPLIT_DAYS, isActive: true },
  });

  return { metrics: defs.length, logs: logs.length };
}

module.exports = { seedSandbox, SANDBOX_TTL_DAYS };
