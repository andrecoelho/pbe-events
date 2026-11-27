// The admin audit log (#61) against a real database. Runs only when POSTGRES_URL is a local dev database;
// CI has none, so it skips there.
import { listAdminActions, logAdminAction } from '@/server/services/audit';
import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from 'bun';

function isLocalDatabase() {
  try {
    const url = new URL(process.env.POSTGRES_URL ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['15432', '15433'].includes(url.port);
  } catch {
    return false;
  }
}

const userId = `test-audit-${Bun.randomUUIDv7()}`;

afterAll(async () => {
  if (isLocalDatabase()) {
    await sql`DELETE FROM admin_audit_log WHERE user_id = ${userId}`;
  }
});

describe.skipIf(!isLocalDatabase())('admin audit log', () => {
  test('records actions with their details and lists them newest first, a page at a time', async () => {
    const user = { id: userId, email: 'audit@example.com' };
    const event = { id: 'e1', name: 'Audit event' };

    await logAdminAction({ user, action: 'event.reset', event });
    await logAdminAction({ user, action: 'team.release_device', event, details: { teamNumber: 2, teamName: 'Lions' } });
    await logAdminAction({ user, action: 'event.reset', event: null });

    const mine = (rows: Awaited<ReturnType<typeof listAdminActions>>) => rows.filter((r) => r.user_id === userId);
    const all = mine(await listAdminActions(1000));

    expect(all.map((r) => r.action)).toEqual(['event.reset', 'team.release_device', 'event.reset']);
    expect(all[0]).toMatchObject({ event_id: null, event_name: null, user_email: 'audit@example.com' });
    expect(all[1]).toMatchObject({ event_name: 'Audit event', details: { teamNumber: 2, teamName: 'Lions' } });

    const older = mine(await listAdminActions(1000, all[0]!.id));

    expect(older.map((r) => r.id)).toEqual([all[1]!.id, all[2]!.id]);
  });
});
