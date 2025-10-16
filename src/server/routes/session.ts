import { db } from '@/server/db';
import { getSession } from '@/server/session';
import type { User, Routes } from '@/server/types';
import { apiData, apiNotFound, apiUnauthorized } from '@/server/utils/responses';

const querySelectUser = db.query<User, { $userId: string }>(
  `SELECT id, email, firstName, lastName FROM users WHERE id = $userId`
);

export const sessionRoutes: Routes = {
  '/api/session': {
    GET: (req) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const user = querySelectUser.get({ $userId: session.userId });

      if (!user) {
        return apiNotFound();
      }

      return apiData({ user });
    }
  }
};
