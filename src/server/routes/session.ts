import { auth } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { hasAnyEventRole, MANAGER_ROLES } from '@/server/services/permissions';
import type { Routes } from '@/server/types';

export const sessionRoutes: Routes = {
  '/api/session': {
    GET: route(auth(), async ({ user: { id, email, first_name, last_name, avatar_url, is_super_admin } }) => ({
      user: {
        id,
        email,
        first_name,
        last_name,
        avatar_url,
        is_super_admin,
        // Owner or admin of an event, so the admin page shows them its live connections (#89).
        is_event_admin: is_super_admin || (await hasAnyEventRole(id, MANAGER_ROLES))
      }
    }))
  }
};
