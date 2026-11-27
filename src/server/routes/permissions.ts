import {
  addPermission,
  getEventForRoles,
  listEventPermissions,
  MANAGER_ROLES,
  removePermission,
  type Role,
  updatePermission
} from '@/server/services/permissions';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiBadRequest, apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

export const permissionRoutes: Routes = {
  '/api/events/:id/permissions': {
    GET: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await getEventForRoles(eventId, session.user_id, MANAGER_ROLES);

      if (!event) {
        return apiForbidden();
      }

      const permissions = await listEventPermissions(eventId);

      return apiData({ eventName: event.name, permissions });
    },
    POST: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await getEventForRoles(eventId, session.user_id, MANAGER_ROLES);

      if (!event) {
        return apiForbidden();
      }

      const { userId, roleId } = (await req.json()) as { userId: string; roleId: Role };

      if (!userId || !roleId) {
        return apiBadRequest('userId and roleId are required');
      }

      await addPermission(eventId, userId, roleId);

      return apiData();
    },

    PATCH: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await getEventForRoles(eventId, session.user_id, MANAGER_ROLES);

      if (!event) {
        return apiForbidden();
      }

      const { userId, roleId } = (await req.json()) as { userId: string; roleId: Role };

      if (!userId || !roleId) {
        return apiBadRequest('userId and roleId are required');
      }

      if (roleId === 'owner') {
        return apiBadRequest('Cannot assign owner role');
      }

      await updatePermission(eventId, userId, roleId);

      return apiData();
    },

    DELETE: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await getEventForRoles(eventId, session.user_id, MANAGER_ROLES);

      if (!event) {
        return apiForbidden();
      }

      const { userId } = (await req.json()) as { userId: string };

      if (!userId) {
        return apiBadRequest('userId is required');
      }

      await removePermission(eventId, userId);

      return apiData();
    }
  }
};
