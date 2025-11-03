import { sql } from 'bun';
import { createSession, deleteSession } from '@/server/session';
import type { Routes, User } from '@/server/types';
import { apiData, apiUnauthorized } from '@/server/utils/responses';

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
  }
};
