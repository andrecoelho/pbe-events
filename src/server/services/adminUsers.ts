// User management on the admin page (#58): search, edit, disable, and one-time password reset links.
import { hashToken, newToken } from '@/server/utils/tokens';
import { sql } from 'bun';

// How long a reset link works.
export const RESET_LINK_HOURS = 24;

export interface AdminUserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_super_admin: boolean;
  disabled_at: Date | null;
  created_at: Date;
  event_count: number;
  session_count: number;
  // Sessions last 30 days and are renewed at most once a day, so this is the last use to within a day.
  last_active_at: Date | null;
}

const USER_COLUMNS = sql`
  u.id, u.email, u.first_name, u.last_name, u.is_super_admin, u.disabled_at, u.created_at,
  (SELECT count(*)::int FROM permissions p WHERE p.user_id = u.id) AS event_count,
  (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > CURRENT_TIMESTAMP) AS session_count,
  (SELECT max(s.expires_at) - INTERVAL '30 days' FROM sessions s WHERE s.user_id = u.id)
    AS last_active_at
`;

// Users whose email or name contains `query` (all users when it's empty), by email, at most `limit`.
export async function searchUsers(query: string, limit: number): Promise<AdminUserRow[]> {
  const pattern = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  return await sql`
    SELECT ${USER_COLUMNS}
    FROM users u
    WHERE u.email ILIKE ${pattern} OR (u.first_name || ' ' || u.last_name) ILIKE ${pattern}
    ORDER BY u.email
    LIMIT ${limit}
  `;
}

export async function getAdminUser(userId: string): Promise<AdminUserRow | null> {
  const rows: AdminUserRow[] = await sql`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ${userId}`;

  return rows[0] ?? null;
}

// The events the user has a role on.
export async function listUserEvents(userId: string): Promise<{ id: string; name: string; role_id: string }[]> {
  return await sql`
    SELECT events.id, events.name, permissions.role_id
    FROM permissions JOIN events ON events.id = permissions.event_id
    WHERE permissions.user_id = ${userId}
    ORDER BY CASE permissions.role_id WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, events.name
  `;
}

export async function updateUserDetails(
  userId: string,
  details: { email: string; firstName: string; lastName: string }
) {
  await sql`
    UPDATE users SET email = ${details.email}, first_name = ${details.firstName}, last_name = ${details.lastName}
    WHERE id = ${userId}
  `;
}

export async function setUserDisabled(userId: string, disabled: boolean) {
  if (disabled) {
    await sql`UPDATE users SET disabled_at = CURRENT_TIMESTAMP WHERE id = ${userId} AND disabled_at IS NULL`;
  } else {
    await sql`UPDATE users SET disabled_at = NULL WHERE id = ${userId}`;
  }
}

// A new one-time reset link token for the user; earlier unused ones stop working.
export async function createResetToken(userId: string, createdBy: string) {
  const token = newToken();

  await sql.begin(async (tx) => {
    await tx`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;
    await tx`
      INSERT INTO password_reset_tokens (token_hash, user_id, created_by, expires_at)
      VALUES (${hashToken(token)}, ${userId}, ${createdBy}, CURRENT_TIMESTAMP + make_interval(hours => ${RESET_LINK_HOURS}))
    `;
  });

  return token;
}

// Sets the password of the token's user and uses the token up. The user id, or null when the token is unknown,
// used or expired.
export async function resetPasswordWithToken(token: string, password: string): Promise<string | null> {
  const passwordHash = await Bun.password.hash(password);

  const rows: { user_id: string }[] = await sql.begin(async (tx) => {
    const used: { user_id: string }[] = await tx`
      UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE token_hash = ${hashToken(token)} AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      RETURNING user_id
    `;

    if (used[0]) {
      await tx`UPDATE users SET password = ${passwordHash} WHERE id = ${used[0].user_id}`;
    }

    return used;
  });

  return rows[0]?.user_id ?? null;
}
