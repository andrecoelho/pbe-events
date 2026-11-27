import { auth, json } from '@/server/http/middleware';
import { badRequest, notFound, route } from '@/server/http/route';
import {
  changePassword,
  checkAvatar,
  deleteUser,
  findUserByEmail,
  isEmailTaken,
  removeAvatar,
  setAvatar,
  updateProfile
} from '@/server/services/users';
import type { Routes } from '@/server/types';
import { apiData } from '@/server/utils/responses';
import { z } from 'zod';

// Empty strings count as "leave unchanged", as before.
const optionalText = z
  .string()
  .optional()
  .transform((value) => value || undefined);
const Profile = z.object({ email: optionalText, firstName: optionalText, lastName: optionalText });

const passwordsRequired = 'Current password and new password are required';
const PasswordChange = z.object({
  currentPassword: z.string({ error: passwordsRequired }).min(1, passwordsRequired),
  newPassword: z
    .string({ error: passwordsRequired })
    .min(1, passwordsRequired)
    .min(8, 'New password must be at least 8 characters')
});

export const userRoutes: Routes = {
  // Look a user up by email, to share an event with them.
  '/api/users': {
    GET: route(auth(), async ({ req }) => {
      const email = new URL(req.url).searchParams.get('email');

      if (!email) {
        throw badRequest('Email parameter required');
      }

      const user = await findUserByEmail(email);

      if (!user) {
        throw notFound('User not found');
      }

      return { user };
    })
  },

  '/api/users/me': {
    // Deletes the account and every event the user owns.
    DELETE: route(auth(), async ({ user }) => {
      await deleteUser(user.id);

      return apiData({}, { 'Set-Cookie': `sessionId=; HttpOnly; Secure; Path=/; Max-Age=0` });
    }),

    PATCH: route(auth(), json(Profile), async ({ user, body }) => {
      if (!body.email && !body.firstName && !body.lastName) {
        throw badRequest('At least one field is required');
      }

      if (body.email && (await isEmailTaken(body.email, user.id))) {
        throw badRequest('Email is already in use');
      }

      await updateProfile(user.id, body);

      return {};
    })
  },

  '/api/users/me/password': {
    PATCH: route(auth(), json(PasswordChange), async ({ user, body }) => {
      if (!(await changePassword(user.id, body.currentPassword, body.newPassword))) {
        throw badRequest('Current password is incorrect');
      }

      return {};
    })
  },

  // Multipart form with an `avatar` image.
  '/api/users/me/avatar': {
    POST: route(auth(), async ({ user, req }) => {
      const file = (await req.formData()).get('avatar');

      if (!file || !(file instanceof File)) {
        throw badRequest('Avatar file is required');
      }

      checkAvatar(file);

      return { avatarUrl: await setAvatar(user.id, file) };
    }),

    DELETE: route(auth(), async ({ user }) => {
      await removeAvatar(user.id);
      return {};
    })
  }
};
