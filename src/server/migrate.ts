// Applies the SQL files in migrations/ that haven't run yet, in name order, each in its own transaction.
// Run with `bun run migrate`; Railway runs it before every deploy.
import { sql } from 'bun';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const migrationsDir = join(import.meta.dir, '../../migrations');

// Databases created from the old pbe.sql already have this schema.
const BASELINE = '0001_init.sql';

export async function migrate(log: (message: string) => void = console.log) {
  // One connection for the whole run, so the lock and the migrations share a session.
  // The lock keeps two runners (e.g. two deploys starting together) from overlapping.
  const db = await sql.reserve();
  await db`SELECT pg_advisory_lock(hashtext('pbe_schema_migrations'))`;

  try {
    await db`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const rows: { name: string }[] = await db`SELECT name FROM schema_migrations`;
    const applied = new Set(rows.map((row) => row.name));

    if (applied.size === 0) {
      const [{ exists }] = await db`SELECT to_regclass('public.users') IS NOT NULL AS exists`;

      if (exists) {
        await db`INSERT INTO schema_migrations (name) VALUES (${BASELINE})`;
        applied.add(BASELINE);
        log(`Existing database: marked ${BASELINE} as applied`);
      }
    }

    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
    const pending = files.filter((file) => !applied.has(file));

    for (const file of pending) {
      const text = await Bun.file(join(migrationsDir, file)).text();

      await db.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });

      log(`Applied ${file}`);
    }

    if (pending.length === 0) {
      log('Database is up to date');
    }
  } finally {
    await db`SELECT pg_advisory_unlock(hashtext('pbe_schema_migrations'))`;
    db.release();
  }
}

if (import.meta.main) {
  await migrate();
  await sql.end();
}
