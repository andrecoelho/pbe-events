// Deletes everything in the local database and rebuilds it from migrations/. Dev only.
// Run with `bun run db:reset` (add `-- --yes` to skip the question). Refuses anything but a database on this machine.
import { migrate } from '@/server/migrate';
import { sql } from 'bun';
import { requireLocalDatabase } from './local-db';

const target = requireLocalDatabase('db:reset');

// A tunnel on another port looks local too, so show what would be lost and ask, unless --yes.
const [{ hasEvents }] = await sql`SELECT to_regclass('public.events') IS NOT NULL AS "hasEvents"`;
const events = hasEvents ? (await sql`SELECT count(*)::int AS n FROM events`)[0].n : 0;

if (
  !process.argv.includes('--yes') &&
  prompt(`Delete everything in ${target} (${events} events)? Type "reset":`) !== 'reset'
) {
  console.error('Not reset.');
  process.exit(1);
}

await sql`DROP SCHEMA public CASCADE`;
await sql`CREATE SCHEMA public`;
console.log(`Emptied ${target}`);

await migrate();
await sql.end();
