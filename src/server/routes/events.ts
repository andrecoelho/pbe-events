import { db } from '@/server/db';
import type { PBEEvent, Permission, Routes } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';
import {
  apiBadRequest,
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';

const querySelectEventsByUserId = db.query<PBEEvent[], { $userId: string }>(
  `SELECT events.*
   FROM events
   JOIN permissions ON events.id = permissions.eventId
   WHERE permissions.userId = $userId`
);

const querySelectEvent = db.query<PBEEvent, { $eventId: string; $userId: string }>(
  `SELECT events.*
   FROM events
   JOIN permissions ON events.id = permissions.eventId
   WHERE permissions.userId = $userId AND events.id = $eventId AND permissions.roleId IN ('owner', 'admin')`
);

const queryInsertEvent = db.query<{}, { $id: string; $name: string }>(
  `INSERT INTO events (id, name) VALUES ($id, $name)`
);

const queryDeleteEvent = db.query<{}, { $eventId: string }>(`DELETE FROM events WHERE id = $eventId`);

const queryUpdateEventName = db.query<{}, { $eventId: string; $name: string }>(
  `UPDATE events SET name = $name WHERE id = $eventId`
);

const queryInsertPermission = db.query<{}, { $userId: string; $eventId: string; $roleId: string }>(
  `INSERT INTO permissions (userId, eventId, roleId) VALUES ($userId, $eventId, $roleId)`
);

const querySelectPermissions = db.query<Permission, { $userId: string; $eventId: string }>(
  `SELECT * FROM permissions WHERE userId = $userId AND eventId = $eventId`
);

export const eventsRoutes: Routes = {
  '/api/events': {
    GET: (req) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const events = querySelectEventsByUserId.all({ $userId: session.userId });

      return apiData({ events });
    },
    POST: async (req) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return apiBadRequest('Invalid event name');
      }

      const id = Bun.randomUUIDv7();

      try {
        queryInsertEvent.run({ $id: id, $name: name.trim() });

        queryInsertPermission.run({ $userId: session.userId, $eventId: id, $roleId: 'owner' });
      } catch (error) {
        console.error('Error creating event:', error);

        return apiServerError('Failed to create event');
      }

      return apiData({ id, name: name.trim() });
    }
  },
  '/api/events/:id': {
    PATCH: async (req: BunRequest<'/api/events/:id'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return apiBadRequest('Invalid event name');
      }

      const id = req.params.id;
      const userEvent = querySelectPermissions.get({ $userId: session.userId, $eventId: id });

      if (!userEvent) {
        return apiNotFound('Event not found');
      }

      if (userEvent.roleId !== 'owner' && userEvent.roleId !== 'admin') {
        return apiForbidden();
      }

      queryUpdateEventName.run({ $eventId: id, $name: name.trim() });

      return apiData({ id, name: name.trim() });
    },
    DELETE: (req: BunRequest<'/api/events/:id'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const id = req.params.id;
      const userEvent = querySelectPermissions.get({ $userId: session.userId, $eventId: id });

      if (!userEvent) {
        return apiNotFound('Event not found');
      }

      if (userEvent.roleId !== 'owner') {
        return apiForbidden();
      }

      queryDeleteEvent.run({ $eventId: id });

      return apiData();
    }
  }
};
