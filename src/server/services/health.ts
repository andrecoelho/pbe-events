// What the admin page's Health section shows (#60): the running version, uptime, memory and the database.
import { sql } from 'bun';

const startedAt = Date.now();

// The commit this server runs: Railway's deploy variable, or the checkout's HEAD in development.
function gitCommit() {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA;
  }

  try {
    const result = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { stderr: 'ignore' });
    return result.success ? result.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

const commit = gitCommit();

export function versionInfo() {
  return {
    commit,
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    bun: Bun.version,
    startedAt
  };
}

export function processInfo() {
  const memory = process.memoryUsage();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal
  };
}

// The quickest of three round trips, the database's size and the last migration applied.
export async function databaseInfo() {
  const timings: number[] = [];

  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await sql`SELECT 1`;
    timings.push(performance.now() - start);
  }

  const [size]: { bytes: string }[] = await sql`SELECT pg_database_size(current_database())::text AS bytes`;
  const [migration]: { name: string; applied_at: Date }[] = await sql`
    SELECT name, applied_at FROM schema_migrations ORDER BY name DESC LIMIT 1
  `;

  return {
    latencyMs: Math.round(Math.min(...timings) * 10) / 10,
    sizeBytes: Number(size?.bytes ?? 0),
    latestMigration: migration
      ? { name: migration.name, appliedAt: new Date(migration.applied_at).toISOString() }
      : null
  };
}
