// Event tags and archiving (#72) against a real database. Runs only when POSTGRES_URL is a local dev database
// (`mise run db`); CI has none, so it skips there.
import {
  createEvent,
  duplicateEvent,
  listEventsForUser,
  setEventArchived,
  setEventTags
} from '@/server/services/events';
import { afterEach, describe, expect, test } from 'bun:test';
import { sql } from 'bun';

function isLocalDatabase() {
  try {
    const url = new URL(process.env.POSTGRES_URL ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['15432', '15433'].includes(url.port);
  } catch {
    return false;
  }
}

const users: string[] = [];

async function makeUser() {
  const id = `test-tags-${Bun.randomUUIDv7()}`;
  users.push(id);
  await sql`
    INSERT INTO users (id, email, first_name, last_name, password)
    VALUES (${id}, ${`${id}@example.com`}, 'Tag', 'Tester', 'x')
  `;

  return id;
}

afterEach(async () => {
  for (const id of users.splice(0)) {
    await sql`
      DELETE FROM events WHERE id IN (SELECT event_id FROM permissions WHERE user_id = ${id} AND role_id = 'owner')
    `;
    await sql`DELETE FROM users WHERE id = ${id}`;
  }
});

describe.skipIf(!isLocalDatabase())('event tags and archiving', () => {
  test('saves tags, including none, and lists them', async () => {
    const userId = await makeUser();
    const { id } = await createEvent(userId, 'Spring Regional');

    await setEventTags(id, ['Regional', "Teens' 2027", 'a,b']);
    expect((await listEventsForUser(userId))[0]?.tags).toEqual(['Regional', "Teens' 2027", 'a,b']);

    await setEventTags(id, []);
    expect((await listEventsForUser(userId))[0]?.tags).toEqual([]);
  });

  test('archives and unarchives, keeping the first archive time', async () => {
    const userId = await makeUser();
    const { id } = await createEvent(userId, 'NUC 2026');

    const archivedAt = await setEventArchived(id, true);
    expect(archivedAt).toBeInstanceOf(Date);
    expect(await setEventArchived(id, true)).toEqual(archivedAt);
    expect((await listEventsForUser(userId))[0]?.archived_at).toEqual(archivedAt);

    expect(await setEventArchived(id, false)).toBeNull();
  });

  test('a duplicate keeps the tags but is not archived', async () => {
    const userId = await makeUser();
    const { id } = await createEvent(userId, 'Fall Regional');
    await setEventTags(id, ['Regional']);
    await setEventArchived(id, true);

    await duplicateEvent(id, userId, 'Fall Regional copy');

    const copy = (await listEventsForUser(userId)).find((e) => e.name === 'Fall Regional copy');
    expect(copy?.tags).toEqual(['Regional']);
    expect(copy?.archived_at).toBeNull();
  });
});
