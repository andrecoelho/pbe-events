import { json, rateLimit } from '@/server/http/middleware';
import { badRequest, forbidden, route, unauthorized } from '@/server/http/route';
import { resetPasswordWithToken } from '@/server/services/adminUsers';
import { createSession, deleteSession, endUserSessions } from '@/server/session';
import { checkAvatar, createUser, getLoginByEmail, isEmailTaken, saveAvatarFile } from '@/server/services/users';
import type { Routes } from '@/server/types';
import { httpOnlyCookie } from '@/server/utils/cookies';
import { apiData } from '@/server/utils/responses';
import { z } from 'zod';

const PasswordReset = z.object({
  token: z.string().min(1, 'This reset link is incomplete. Open the whole link you were sent.'),
  password: z.string().min(8, 'The new password must be at least 8 characters.')
});

function sessionCookie(value: string, extra = '') {
  return httpOnlyCookie('sessionId', value, extra);
}

export const authRoutes: Routes = {
  '/api/login': {
    POST: route(async ({ req }) => {
      const { email, password } = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };

      // One message for every failure, so it doesn't reveal which emails have accounts.
      const invalid = () => unauthorized('That email and password don’t match an account. Check them and try again.');

      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        throw invalid();
      }

      const user = await getLoginByEmail(email);

      if (!user || !(await Bun.password.verify(password, user.password))) {
        throw invalid();
      }

      // Only said once the password is right, so it doesn't reveal which accounts exist.
      if (user.disabled_at) {
        throw forbidden('This account is disabled. Ask an administrator if you need it back.');
      }

      return apiData({}, { 'Set-Cookie': sessionCookie(await createSession(user.id)) });
    })
  },

  // Sets a new password with a one-time link from an admin (#58), and signs the account out everywhere.
  '/api/password-reset': {
    POST: route(rateLimit({ limit: 10, windowMs: 60_000 }), json(PasswordReset), async ({ body }) => {
      const userId = await resetPasswordWithToken(body.token, body.password);

      if (!userId) {
        throw badRequest('This reset link has expired or was already used. Ask an administrator for a new one.');
      }

      await endUserSessions(userId);

      return {};
    })
  },

  '/api/logout': {
    POST: route(async ({ req }) => {
      await deleteSession(req);

      return apiData({}, { 'Set-Cookie': sessionCookie('', ' Max-Age=0') });
    })
  },

  // Multipart form: email, firstName, lastName, password and an optional avatar.
  '/api/signup': {
    POST: route(async ({ req }) => {
      const form = await req.formData();
      const text = (name: string) => {
        const value = form.get(name);
        return typeof value === 'string' ? value : '';
      };
      const email = text('email');
      const firstName = text('firstName');
      const lastName = text('lastName');
      const password = text('password');
      const avatar = form.get('avatar');

      if (!email || !firstName || !lastName || !password) {
        throw badRequest('All fields are required');
      }

      if (password.length < 8) {
        throw badRequest('Password must be at least 8 characters');
      }

      if (await isEmailTaken(email)) {
        throw badRequest('Email is already in use');
      }

      const id = Bun.randomUUIDv7();
      let avatarUrl: string | null = null;

      if (avatar instanceof File && avatar.size > 0) {
        checkAvatar(avatar);
        avatarUrl = await saveAvatarFile(id, avatar);
      }

      await createUser({ id, email, firstName, lastName, password, avatarUrl });

      return {};
    })
  }
};
