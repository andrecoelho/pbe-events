// Event management (#59) against a real database. Runs only when POSTGRES_URL is a local dev database;
// CI has none, so it skips there.
import { joinEvent, leaveEvent, listAllEvents, transferOwnership } from '@/server/services/adminEvents';
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

const id = `test-events-${Bun.randomUUIDv7()}`;
const [owner, other, admin] = ['owner', 'other', 'admin'].map((name) => `${id}-${name}`) as [string, string, string];

const roles = async () =>
  Object.fromEntries(
    (await sql`SELECT user_id, role_id FROM permissions WHERE event_id = ${id}`).map(
      (row: { user_id: string; role_id: string }) => [row.user_id, row.role_id]
    )
  );

afterAll(async () => {
  if (isLocalDatabase()) {
    await sql`DELETE FROM events WHERE id = ${id}`;
    await sql`DELETE FROM users WHERE id IN ${sql([owner, other, admin])}`;
  }
});

describe.skipIf(!isLocalDatabase())('event management', () => {
  test('setup', async () => {
    for (const user of [owner, other, admin]) {
      await sql`INSERT INTO users (id, email, password, first_name, last_name) VALUES (${user}, ${`${user}@example.com`}, 'x', 'T', 'U')`;
    }

    await sql`INSERT INTO events (id, name) VALUES (${id}, ${`Event ${id}`})`;
    await sql`INSERT INTO permissions (user_id, event_id, role_id) VALUES (${owner}, ${id}, 'owner'), (${other}, ${id}, 'judge')`;
  });

  test('lists events by name or owner email, with their owner', async () => {
    const [row] = await listAllEvents(`${owner}@example`, 10);

    expect(row).toMatchObject({ id, owner_email: `${owner}@example.com`, people_count: 2 });
    expect((await listAllEvents(id, 10)).map((e) => e.id)).toEqual([id]);
  });

  test('transfer makes the new owner and keeps the old one as an admin', async () => {
    expect(await transferOwnership(id, other)).toBe(owner);
    expect(await roles()).toEqual({ [owner]: 'admin', [other]: 'owner' });
  });

  test('a super admin joins as admin once, and can leave; an owner can’t leave', async () => {
    expect(await joinEvent(id, admin)).toBe(true);
    expect(await joinEvent(id, admin)).toBe(false);
    expect((await roles())[admin]).toBe('admin');
    expect(await leaveEvent(id, admin)).toBe(true);
    expect(await leaveEvent(id, other)).toBe(false);
    expect(await roles()).toEqual({ [owner]: 'admin', [other]: 'owner' });
  });
});
