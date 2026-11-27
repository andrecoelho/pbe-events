// Deletes everything in the local database and rebuilds it from migrations/. Dev only.
// Run with `bun run db:reset` (add `-- --yes` to skip the question). Refuses anything but a database on this machine.
import { migrate } from '@/server/migrate';
import { sql } from 'bun';

const url = new URL(process.env.POSTGRES_URL ?? '');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

// The staging tunnel is also on localhost, so refuse its port too.
if (!local || url.port === '15432' || process.env.NODE_ENV === 'production') {
  console.error(`Refusing to reset ${url.hostname}:${url.port}: db:reset only runs against a local dev database.`);
  process.exit(1);
}

// A tunnel on another port looks local too, so show what would be lost and ask, unless --yes.
const target = `${url.hostname}:${url.port}${url.pathname}`;
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
