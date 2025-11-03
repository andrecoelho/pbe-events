import { sql } from 'bun';
import { getSession } from '@/server/session';
import type { Routes, User } from '@/server/types';
import { apiBadRequest, apiData, apiNotFound, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

export const userRoutes: Routes = {
  '/api/users': {
    GET: async (req: BunRequest) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const url = new URL(req.url);
      const email = url.searchParams.get('email');

      if (!email) {
        return apiBadRequest('Email parameter required');
      }

      const users: User[] = await sql`
        SELECT id, first_name, last_name
        FROM users
        WHERE email = ${email}
      `;
      const user = users[0];

      if (!user) {
        return apiNotFound('User not found');
      }

      return apiData({ user });
    }
  }
};
