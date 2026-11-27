import { eventRole, json } from '@/server/http/middleware';
import { badRequest, route } from '@/server/http/route';
import {
  addPermission,
  listEventPermissions,
  MANAGER_ROLES,
  removePermission,
  updatePermission
} from '@/server/services/permissions';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const required = 'userId and roleId are required';
const UserRole = z.object({
  userId: z.string({ error: required }).min(1, required),
  roleId: z.enum(['owner', 'admin', 'judge'], { error: required })
});
const UserOnly = z.object({ userId: z.string({ error: 'userId is required' }).min(1, 'userId is required') });

export const permissionRoutes: Routes = {
  '/api/events/:id/permissions': {
    GET: route(eventRole(...MANAGER_ROLES), async ({ event }) => ({
      eventName: event.name,
      permissions: await listEventPermissions(event.id)
    })),

    POST: route(eventRole(...MANAGER_ROLES), json(UserRole), async ({ event, body }) => {
      await addPermission(event.id, body.userId, body.roleId);
      return {};
    }),

    PATCH: route(eventRole(...MANAGER_ROLES), json(UserRole), async ({ event, body }) => {
      if (body.roleId === 'owner') {
        throw badRequest('Cannot assign owner role');
      }

      await updatePermission(event.id, body.userId, body.roleId);
      return {};
    }),

    DELETE: route(eventRole(...MANAGER_ROLES), json(UserOnly), async ({ event, body }) => {
      await removePermission(event.id, body.userId);
      return {};
    })
  }
};
