// User management (#58) against a real database. Runs only when POSTGRES_URL is a local dev database;
// CI has none, so it skips there.
import {
  createResetToken,
  getAdminUser,
  resetPasswordWithToken,
  searchUsers,
  setUserDisabled
} from '@/server/services/adminUsers';
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

const userId = `test-users-${Bun.randomUUIDv7()}`;
const email = `${userId}@example.com`;

afterAll(async () => {
  if (isLocalDatabase()) {
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }
});

describe.skipIf(!isLocalDatabase())('user management', () => {
  test('setup', async () => {
    await sql`
      INSERT INTO users (id, email, password, first_name, last_name)
      VALUES (${userId}, ${email}, ${await Bun.password.hash('old-password')}, 'Percent_Test', 'User')
    `;
  });

  test('search matches email or name, and treats % and _ literally', async () => {
    expect((await searchUsers(userId, 10)).map((u) => u.id)).toEqual([userId]);
    expect((await searchUsers('percent_test user', 10)).map((u) => u.id)).toContain(userId);
    expect((await searchUsers('percent%test', 10)).map((u) => u.id)).not.toContain(userId);
  });

  test('a reset link works once, and a new one cancels the last', async () => {
    const first = await createResetToken(userId, 'admin');
    const second = await createResetToken(userId, 'admin');

    expect(await resetPasswordWithToken(first, 'new-password-1')).toBeNull();
    expect(await resetPasswordWithToken(second, 'new-password-2')).toBe(userId);
    expect(await resetPasswordWithToken(second, 'new-password-3')).toBeNull();

    const [row] = await sql`SELECT password FROM users WHERE id = ${userId}`;

    expect(await Bun.password.verify('new-password-2', row.password)).toBe(true);
  });

  test('an expired link doesn’t work', async () => {
    const token = await createResetToken(userId, 'admin');

    await sql`UPDATE password_reset_tokens SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE user_id = ${userId}`;

    expect(await resetPasswordWithToken(token, 'new-password-4')).toBeNull();
  });

  test('disable and enable', async () => {
    await setUserDisabled(userId, true);
    expect((await getAdminUser(userId))?.disabled_at).not.toBeNull();

    await setUserDisabled(userId, false);
    expect((await getAdminUser(userId))?.disabled_at).toBeNull();
  });
});
