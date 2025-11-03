import { sql } from 'bun';
import { getSession } from '@/server/session';
import type { User, Routes } from '@/server/types';
import { apiData, apiNotFound, apiUnauthorized } from '@/server/utils/responses';

export const sessionRoutes: Routes = {
  '/api/session': {
    GET: async (req) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const users: User[] = await sql`SELECT id, email, first_name, last_name FROM users WHERE id = ${session.user_id}`;
      const user = users[0];

      if (!user) {
        return apiNotFound();
      }

      return apiData({ user });
    }
  }
};
