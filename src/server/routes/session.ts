import { auth } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import type { Routes } from '@/server/types';

export const sessionRoutes: Routes = {
  '/api/session': {
    GET: route(auth(), ({ user: { id, email, first_name, last_name, avatar_url } }) => ({
      user: { id, email, first_name, last_name, avatar_url }
    }))
  }
};
