import { db } from '@/server/db';
import { getSession } from '@/server/session';
import type { User, Routes } from '@/server/types';
import { apiData, apiNotFound, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

const querySelectUser = db.query<User, { $userId: string }>(
  `SELECT id, email, first_name, last_name FROM users WHERE id = $userId`
);

export const sessionRoutes: Routes = {
  '/api/session': {
    GET: (req: BunRequest) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const user = querySelectUser.get({ $userId: session.user_id });

      if (!user) {
        return apiNotFound();
      }

      return apiData({ user });
    }
  }
};
