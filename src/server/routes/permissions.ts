import { eventRole, json } from '@/server/http/middleware';
import { badRequest, notFound, route } from '@/server/http/route';
import {
  addPermission,
  getEventRole,
  listEventPermissions,
  MANAGER_ROLES,
  removePermission,
  roleChangeError,
  updatePermission,
  type Role
} from '@/server/services/permissions';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const required = 'userId and roleId are required';
const UserRole = z.object({
  userId: z.string({ error: required }).min(1, required),
  roleId: z.enum(['owner', 'admin', 'judge'], { error: required })
});
// The person's role on the event, or null.
const currentRole = async (eventId: string, userId: string): Promise<Role | null> =>
  (await getEventRole(eventId, userId))?.role_id ?? null;

// 400 when the change would add, change or remove an owner (#90).
function checkRoleChange(current: Role | null, next: Role | null) {
  const error = roleChangeError(current, next);

  if (error) {
    throw badRequest(error);
  }
}

const UserOnly = z.object({ userId: z.string({ error: 'userId is required' }).min(1, 'userId is required') });

export const permissionRoutes: Routes = {
  '/api/events/:id/permissions': {
    GET: route(eventRole(...MANAGER_ROLES), async ({ event }) => ({
      eventName: event.name,
      permissions: await listEventPermissions(event.id)
    })),

    POST: route(eventRole(...MANAGER_ROLES), json(UserRole), async ({ event, body }) => {
      const current = await currentRole(event.id, body.userId);

      if (current) {
        throw badRequest('They already have a role on this event. Change it instead.');
      }

      checkRoleChange(current, body.roleId);
      await addPermission(event.id, body.userId, body.roleId);
      return {};
    }),

    PATCH: route(eventRole(...MANAGER_ROLES), json(UserRole), async ({ event, body }) => {
      const current = await currentRole(event.id, body.userId);

      if (!current) {
        throw notFound('They don’t have a role on this event.');
      }

      checkRoleChange(current, body.roleId);
      await updatePermission(event.id, body.userId, body.roleId);
      return {};
    }),

    DELETE: route(eventRole(...MANAGER_ROLES), json(UserOnly), async ({ event, body }) => {
      checkRoleChange(await currentRole(event.id, body.userId), null);
      await removePermission(event.id, body.userId);
      return {};
    })
  }
};
