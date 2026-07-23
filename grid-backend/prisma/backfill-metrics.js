/**
 * Habit/HabitLog → MetricDef/MetricLog backfill.
 *
 *   node prisma/backfill-metrics.js --dry     # report only, no writes
 *   node prisma/backfill-metrics.js           # perform the migration
 *
 * Idempotent: re-running skips habits that already have a matching MetricDef,
 * and log upserts are keyed on (defId, loggedDate).
 *
 * Legacy habit tables are left untouched so this is reversible for one release.
 */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const DRY = process.argv.includes('--dry');

async function main() {
  const habits = await db.habit.findMany({ include: { logs: true } });
  console.log(`Found ${habits.length} habits`);

  let defsCreated = 0, logsCreated = 0, skipped = 0;

  for (const h of habits) {
    const existing = await db.metricDef.findFirst({
      where: { userId: h.userId, name: h.name, type: 'BINARY' },
    });

    if (existing) {
      skipped++;
      console.log(`  skip  "${h.name}" — already migrated`);
      continue;
    }

    console.log(`  ${DRY ? 'would create' : 'create'}  "${h.name}"  (${h.logs.length} logs)`);
    if (DRY) { defsCreated++; logsCreated += h.logs.length; continue; }

    const def = await db.metricDef.create({
      data: {
        userId:     h.userId,
        name:       h.name,
        type:       'BINARY',
        icon:       h.icon,
        color:      h.color,
        target:     null,                       // binary needs no target
        targetDays: h.targetDays ?? null,
        sortOrder:  h.sortOrder,
        archived:   h.archived,
        createdAt:  h.createdAt,
      },
    });
    defsCreated++;

    for (const l of h.logs) {
      // Legacy logs are binary: completed → value 1 / score 1.
      // targetAtLog stays null — there was no target to snapshot.
      await db.metricLog.upsert({
        where:  { defId_loggedDate: { defId: def.id, loggedDate: l.loggedDate } },
        create: {
          defId: def.id, userId: l.userId, loggedDate: l.loggedDate,
          value: l.completed ? 1 : 0, targetAtLog: null,
          score: l.completed ? 1 : 0, source: 'MANUAL', createdAt: l.createdAt,
        },
        update: {},
      });
      logsCreated++;
    }
  }

  console.log(
    `\n${DRY ? '[DRY RUN] ' : ''}defs: ${defsCreated} created, ${skipped} skipped · logs: ${logsCreated}`
  );
  if (DRY) console.log('No writes performed. Re-run without --dry to apply.');
}

main()
  .catch(e => { console.error('Backfill failed:', e); process.exit(1); })
  .finally(() => db.$disconnect());
