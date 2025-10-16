import { db } from '@/server/db';
import { getSession } from '@/server/session';
import type { Routes, User } from '@/server/types';
import { apiBadRequest, apiData, apiNotFound, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

const querySelectUserByEmail = db.query<User, { $email: string }>(
  `SELECT id, firstName, lastName
   FROM users
   WHERE email = $email`
);

export const userRoutes: Routes = {
  '/api/users': {
    GET: (req: BunRequest) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const url = new URL(req.url);
      const email = url.searchParams.get('email');

      if (!email) {
        return apiBadRequest('Email parameter required');
      }

      const user = querySelectUserByEmail.get({ $email: email });

      if (!user) {
        return apiNotFound('User not found');
      }

      return apiData({ user });
    }
  }
};
