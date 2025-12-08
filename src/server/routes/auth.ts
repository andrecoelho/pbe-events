import { createSession, deleteSession } from '@/server/session';
import type { Routes, User } from '@/server/types';
import { apiBadRequest, apiData, apiUnauthorized } from '@/server/utils/responses';
import { sql } from 'bun';
import { join } from 'node:path';

export const authRoutes: Routes = {
  '/api/login': {
    POST: async (req) => {
      const { email, password } = await req.json();
      const invalidMessage = 'Invalid credentials';

      if (!email || !password) {
        return apiUnauthorized(invalidMessage);
      }

      const users: User[] = await sql`SELECT * FROM users WHERE email = ${email}`;
      const user = users[0];

      if (!user) {
        return apiUnauthorized(invalidMessage);
      }

      const isMatch = await Bun.password.verify(password, user.password);

      if (!isMatch) {
        return apiUnauthorized(invalidMessage);
      }

      const sessionId = await createSession(user.id);

      return apiData({}, { 'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Secure; Path=/;` });
    }
  },
  '/api/logout': {
    POST: async (req) => {
      await deleteSession(req);

      return apiData({}, { 'Set-Cookie': `sessionId=; HttpOnly; Secure; Path=/; Max-Age=0` });
    }
  },
  '/api/signup': {
    POST: async (req) => {
      const formData = await req.formData();
      const email = formData.get('email') as string | null;
      const firstName = formData.get('firstName') as string | null;
      const lastName = formData.get('lastName') as string | null;
      const password = formData.get('password') as string | null;
      const avatar = formData.get('avatar') as File | null;

      if (!email || !firstName || !lastName || !password) {
        return apiBadRequest('All fields are required');
      }

      if (password.length < 8) {
        return apiBadRequest('Password must be at least 8 characters');
      }

      // Check if email is already taken
      const existingUsers: { id: string }[] = await sql`
        SELECT id FROM users WHERE email = ${email}
      `;

      if (existingUsers.length > 0) {
        return apiBadRequest('Email is already in use');
      }

      // Hash password
      const hashedPassword = await Bun.password.hash(password);

      // Generate user ID
      const userId = Bun.randomUUIDv7();

      // Handle avatar if provided
      let avatarUrl: string | null = null;

      if (avatar && avatar instanceof File && avatar.size > 0) {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(avatar.type)) {
          return apiBadRequest('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
        }

        // Validate file size (max 500KB)
        const maxSize = 500 * 1024;
        if (avatar.size > maxSize) {
          return apiBadRequest('File size must be less than 500KB');
        }

        // Get file extension from mime type
        const extensions: Record<string, string> = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/webp': '.webp',
          'image/gif': '.gif'
        };
        const ext = extensions[avatar.type] || '.png';

        // Save file to disk
        const fileName = `${userId}${ext}`;
        const filePath = join(global.PBE.imageDir, fileName);

        await Bun.write(filePath, avatar);

        avatarUrl = `/user-image/${fileName}`;
      }

      // Create user
      await sql`
        INSERT INTO users (id, email, password, first_name, last_name, avatar_url)
        VALUES (${userId}, ${email}, ${hashedPassword}, ${firstName}, ${lastName}, ${avatarUrl})
      `;

      return apiData();
    }
  }
};
