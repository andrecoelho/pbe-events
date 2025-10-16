import { db } from '@/server/db';
import { createSession, deleteSession, getSession } from '@/server/session';
import type { Routes, User } from '@/server/types';
import { apiData, apiUnauthorized } from '@/server/utils/responses';

const querySelectUser = db.query<User, { $email: string }>('SELECT * FROM users WHERE email = $email');

export const authRoutes: Routes = {
  '/api/login': {
    POST: async (req) => {
      const { email, password } = await req.json();

      if (!email || !password) {
        return apiUnauthorized('Invalid credentials');
      }

      const user = querySelectUser.get({ $email: email.toLowerCase() });

      if (!user) {
        return apiUnauthorized('Invalid credentials');
      }

      const isMatch = await Bun.password.verify(password, user.password);

      if (!isMatch) {
        return apiUnauthorized('Invalid credentials');
      }

      const sessionId = createSession(user.id);

      return apiData({}, { 'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Secure; Path=/;` });
    }
  },
  '/api/logout': {
    POST: (req) => {
      deleteSession(req);

      return apiData({}, { 'Set-Cookie': `sessionId=; HttpOnly; Secure; Path=/; Max-Age=0` });
    }
  }
};
