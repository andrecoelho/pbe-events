import { db } from '@/server/db';
import { getSession } from '@/server/session';
import type { PBEEvent, Routes } from '@/server/types';
import { apiBadRequest, apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

interface UserPermission {
  userId: string;
  roleId: string;
  email: string;
  firstName: string;
  lastName: string;
}

const querySelectPermissions = db.query<UserPermission, { $eventId: string }>(
  `SELECT permissions.userId, permissions.roleId, users.email, users.firstName, users.lastName
   FROM permissions
   JOIN users ON permissions.userId = users.id
   WHERE eventId = $eventId`
);

const querySelectEvent = db.query<PBEEvent, { $eventId: string; $userId: string }>(
  `SELECT events.name
   FROM events
   JOIN permissions ON events.id = permissions.eventId
   WHERE permissions.userId = $userId AND events.id = $eventId AND permissions.roleId IN ('owner', 'admin')`
);

const queryInsertPermission = db.query<void, { $userId: string; $eventId: string; $roleId: string }>(
  `INSERT INTO permissions (userId, eventId, roleId) VALUES ($userId, $eventId, $roleId)`
);

const queryDeletePermission = db.query<void, { $userId: string; $eventId: string }>(
  `DELETE FROM permissions WHERE userId = $userId AND eventId = $eventId`
);

export const permissionRoutes: Routes = {
  '/api/events/:id/permissions': {
    GET: (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const permissions = querySelectPermissions.all({ $eventId: eventId });

      return apiData({ eventName: event.name, permissions });
    },
    POST: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const { userId, roleId } = await req.json();

      if (!userId || !roleId) {
        return apiBadRequest('userId and roleId are required');
      }

      queryInsertPermission.run({ $userId: userId, $eventId: eventId, $roleId: roleId });

      return apiData({ ok: true });
    },
    DELETE: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const { userId } = await req.json();

      if (!userId) {
        return apiBadRequest('userId is required');
      }

      queryDeletePermission.run({ $userId: userId, $eventId: eventId });

      return apiData({ ok: true });
    }
  }
};
