// Accounts: sign-up, profile, password and avatar.
import { badRequest } from '@/server/http/route';
import { sql } from 'bun';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

export interface PublicUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};
const AVATAR_MAX_BYTES = 500 * 1024;

export async function findUserByEmail(email: string): Promise<PublicUser | null> {
  const rows: PublicUser[] = await sql`
    SELECT id, email, first_name, last_name, avatar_url FROM users WHERE email = ${email}
  `;

  return rows[0] ?? null;
}

// The user's id and password hash, for signing in.
export async function getLoginByEmail(email: string) {
  const rows: { id: string; password: string }[] = await sql`SELECT id, password FROM users WHERE email = ${email}`;

  return rows[0] ?? null;
}

// Whether someone other than `exceptUserId` already uses the email.
export async function isEmailTaken(email: string, exceptUserId = '') {
  const rows = await sql`SELECT id FROM users WHERE email = ${email} AND id != ${exceptUserId}`;

  return rows.length > 0;
}

// Checks the file is an image we accept. Throws a 400 HttpError otherwise.
export function checkAvatar(file: File) {
  if (!AVATAR_TYPES[file.type]) {
    throw badRequest('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
  }

  if (file.size > AVATAR_MAX_BYTES) {
    throw badRequest('File size must be less than 500KB');
  }
}

// Saves the avatar next to the user's id and returns its URL. Call checkAvatar first.
export async function saveAvatarFile(userId: string, file: File) {
  const fileName = `${userId}${AVATAR_TYPES[file.type] ?? '.png'}`;

  await Bun.write(join(global.PBE.imageDir, fileName), file);

  return `/user-image/${fileName}`;
}

async function removeAvatarFile(avatarUrl: string | null) {
  const fileName = avatarUrl?.split('/').pop();

  if (fileName) {
    try {
      await unlink(join(global.PBE.imageDir, fileName));
    } catch {
      // Already gone.
    }
  }
}

async function getAvatarUrl(userId: string) {
  const rows: { avatar_url: string | null }[] = await sql`SELECT avatar_url FROM users WHERE id = ${userId}`;

  return rows[0]?.avatar_url ?? null;
}

export async function createUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  avatarUrl: string | null;
}) {
  const hash = await Bun.password.hash(user.password);

  await sql`
    INSERT INTO users (id, email, password, first_name, last_name, avatar_url)
    VALUES (${user.id}, ${user.email}, ${hash}, ${user.firstName}, ${user.lastName}, ${user.avatarUrl})
  `;
}

// Changes only the fields given.
export async function updateProfile(
  userId: string,
  profile: { email?: string; firstName?: string; lastName?: string }
) {
  await sql`
    UPDATE users
    SET email = COALESCE(${profile.email ?? null}, email),
        first_name = COALESCE(${profile.firstName ?? null}, first_name),
        last_name = COALESCE(${profile.lastName ?? null}, last_name)
    WHERE id = ${userId}
  `;
}

// Returns false when the current password is wrong (or the user is gone).
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const rows: { password: string }[] = await sql`SELECT password FROM users WHERE id = ${userId}`;
  const user = rows[0];

  if (!user || !(await Bun.password.verify(currentPassword, user.password))) {
    return false;
  }

  await sql`UPDATE users SET password = ${await Bun.password.hash(newPassword)} WHERE id = ${userId}`;

  return true;
}

export async function setAvatar(userId: string, file: File) {
  const avatarUrl = await saveAvatarFile(userId, file);

  await sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${userId}`;

  return avatarUrl;
}

export async function removeAvatar(userId: string) {
  await removeAvatarFile(await getAvatarUrl(userId));
  await sql`UPDATE users SET avatar_url = NULL WHERE id = ${userId}`;
}

// Deletes the user and every event they own, all or nothing, then their avatar file.
export async function deleteUser(userId: string) {
  const avatarUrl = await getAvatarUrl(userId);

  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM events
      WHERE id IN (SELECT event_id FROM permissions WHERE user_id = ${userId} AND role_id = 'owner')
    `;
    await tx`DELETE FROM users WHERE id = ${userId}`;
  });

  await removeAvatarFile(avatarUrl);
}
