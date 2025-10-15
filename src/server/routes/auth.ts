import { db } from '@/server/db';
import { createSession, deleteSession, getSession } from '@/server/session';
import type { Routes, User } from '@/server/types';

const querySelectUser = db.query<User, { $email: string }>('SELECT * FROM users WHERE email = $email');

export const authRoutes: Routes = {
  '/api/login': {
    POST: async (req) => {
      const invalidResponse = new Response(JSON.stringify({ error: 'Invalid Credentials' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401
      });
      const { email, password } = await req.json();

      if (!email || !password) {
        return invalidResponse;
      }

      const user = querySelectUser.get({ $email: email.toLowerCase() });

      if (!user) {
        return invalidResponse;
      }

      const isMatch = await Bun.password.verify(password, user.password);

      if (!isMatch) {
        return invalidResponse;
      }

      const sessionId = createSession(user.id);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Secure; Path=/;`
        }
      });
    }
  },
  '/api/logout': {
    POST: (req) => {
      deleteSession(req);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `sessionId=; HttpOnly; Secure; Path=/; Max-Age=0`
        }
      });
    }
  }
};
