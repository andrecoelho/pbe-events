import { sql } from 'bun';
import { getSession } from '@/server/session';
import type { Routes, User } from '@/server/types';
import { apiBadRequest, apiData, apiNotFound, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';

export const userRoutes: Routes = {
  '/api/users': {
    GET: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const url = new URL(req.url);
      const email = url.searchParams.get('email');

      if (!email) {
        return apiBadRequest('Email parameter required');
      }

      const users: User[] = await sql`
        SELECT id, first_name, last_name, avatar_url, email
        FROM users
        WHERE email = ${email}
      `;

      const user = users[0];

      if (!user) {
        return apiNotFound('User not found');
      }

      return apiData({ user });
    }
  },

  '/api/users/me': {
    DELETE: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const userId = session.user_id;

      // Get current avatar URL to delete the file
      const users: { avatar_url: string | null }[] = await sql`
        SELECT avatar_url FROM users WHERE id = ${userId}
      `;

      const user = users[0];

      if (user?.avatar_url) {
        // Extract filename from URL and delete file
        const fileName = user.avatar_url.split('/').pop();

        if (fileName) {
          const filePath = join(global.PBE.imageDir, fileName);

          try {
            await unlink(filePath);
          } catch {
            // File may not exist, ignore error
          }
        }
      }

      await sql`
        DELETE FROM events
        WHERE id IN (
          SELECT event_id FROM permissions WHERE user_id = ${userId} AND role_id = 'owner')`;

      await sql`DELETE FROM users WHERE id = ${userId}`;

      return apiData({}, { 'Set-Cookie': `sessionId=; HttpOnly; Secure; Path=/; Max-Age=0` });
    },

    PATCH: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const body = (await req.json()) as { email?: string; firstName?: string; lastName?: string };
      const { email, firstName, lastName } = body;

      if (!email && !firstName && !lastName) {
        return apiBadRequest('At least one field is required');
      }

      // Check if email is already taken by another user
      if (email) {
        const existingUsers: { id: string }[] = await sql`
          SELECT id FROM users WHERE email = ${email} AND id != ${session.user_id}
        `;

        if (existingUsers.length > 0) {
          return apiBadRequest('Email is already in use');
        }
      }

      // Build update query dynamically
      const updates: string[] = [];
      const values: Record<string, string> = {};

      if (email) {
        updates.push('email = ${email}');
        values.email = email;
      }

      if (firstName) {
        updates.push('first_name = ${firstName}');
        values.firstName = firstName;
      }

      if (lastName) {
        updates.push('last_name = ${lastName}');
        values.lastName = lastName;
      }

      await sql`
        UPDATE users
        SET email = COALESCE(${email ?? null}, email),
            first_name = COALESCE(${firstName ?? null}, first_name),
            last_name = COALESCE(${lastName ?? null}, last_name)
        WHERE id = ${session.user_id}
      `;

      return apiData();
    }
  },

  '/api/users/me/password': {
    PATCH: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return apiBadRequest('Current password and new password are required');
      }

      if (newPassword.length < 8) {
        return apiBadRequest('New password must be at least 8 characters');
      }

      // Verify current password
      const users: { password: string }[] = await sql`
        SELECT password FROM users WHERE id = ${session.user_id}
      `;

      const user = users[0];

      if (!user) {
        return apiNotFound('User not found');
      }

      const isValid = await Bun.password.verify(currentPassword, user.password);

      if (!isValid) {
        return apiBadRequest('Current password is incorrect');
      }

      // Hash and update new password
      const hashedPassword = await Bun.password.hash(newPassword);

      await sql`
        UPDATE users SET password = ${hashedPassword} WHERE id = ${session.user_id}
      `;

      return apiData();
    }
  },

  '/api/users/me/avatar': {
    POST: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const formData = await req.formData();
      const file = formData.get('avatar');

      if (!file || !(file instanceof File)) {
        return apiBadRequest('Avatar file is required');
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

      if (!allowedTypes.includes(file.type)) {
        return apiBadRequest('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
      }

      // Validate file size (max 500KB)
      const maxSize = 500 * 1024;

      if (file.size > maxSize) {
        return apiBadRequest('File size must be less than 500KB');
      }

      // Get file extension from mime type
      const extensions: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif'
      };

      const ext = extensions[file.type] || '.png';

      // Save file to disk
      const fileName = `${session.user_id}${ext}`;
      const filePath = join(global.PBE.imageDir, fileName);

      await Bun.write(filePath, file);

      // Update user avatar_url in database
      const avatarUrl = `/user-image/${fileName}`;

      await sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${session.user_id}`;

      return apiData({ avatarUrl });
    },

    DELETE: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      // Get current avatar URL
      const users: { avatar_url: string | null }[] = await sql`
        SELECT avatar_url FROM users WHERE id = ${session.user_id}
      `;

      const user = users[0];

      if (user?.avatar_url) {
        // Extract filename from URL and delete file
        const fileName = user.avatar_url.split('/').pop();

        if (fileName) {
          const filePath = join(global.PBE.imageDir, fileName);

          try {
            await unlink(filePath);
          } catch {
            // File may not exist, ignore error
          }
        }
      }

      // Clear avatar_url in database
      await sql`UPDATE users SET avatar_url = NULL WHERE id = ${session.user_id}`;

      return apiData();
    }
  }
};
