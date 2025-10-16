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
   JOIN permissions ON events.id = permissions.event_id
   WHERE permissions.user_id = $userId`
);

const querySelectEvent = db.query<PBEEvent, { $eventId: string; $userId: string }>(
  `SELECT events.*
   FROM events
   JOIN permissions ON events.id = permissions.event_id
   WHERE permissions.user_id = $userId AND events.id = $eventId`
);

const queryInsertEvent = db.query<{}, { $id: string; $name: string }>(
  `INSERT INTO events (id, name) VALUES ($id, $name)`
);

const queryDeleteEvent = db.query<{}, { $eventId: string }>(`DELETE FROM events WHERE id = $eventId`);

const queryUpdateEventName = db.query<{}, { $eventId: string; $name: string }>(
  `UPDATE events SET name = $name WHERE id = $eventId`
);

const queryInsertPermission = db.query<{}, { $userId: string; $eventId: string; $roleId: string }>(
  `INSERT INTO permissions (user_id, event_id, role_id) VALUES ($userId, $eventId, $roleId)`
);

const querySelectPermissions = db.query<Permission, { $userId: string; $eventId: string }>(
  `SELECT * FROM permissions WHERE user_id = $userId AND event_id = $eventId`
);

export const eventsRoutes: Routes = {
  '/api/events': {
    GET: (req) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const events = querySelectEventsByUserId.all({ $userId: session.user_id });

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

        queryInsertPermission.run({ $userId: session.user_id, $eventId: id, $roleId: 'owner' });
      } catch (error) {
        console.error('Error creating event:', error);

        return apiServerError('Failed to create event');
      }

      return apiData({ id, name: name.trim() });
    }
  },
  '/api/events/:id': {
    GET: async (req: BunRequest<'/api/events/:id'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const id = req.params.id;
      const event = querySelectEvent.get({ $eventId: id, $userId: session.user_id });

      if (!event) {
        return apiNotFound('Event Not Found');
      }

      return apiData({ event });
    },
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
      const userEvent = querySelectPermissions.get({ $userId: session.user_id, $eventId: id });

      if (!userEvent) {
        return apiNotFound('Event not found');
      }

      if (userEvent.role_id !== 'owner' && userEvent.role_id !== 'admin') {
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
      const userEvent = querySelectPermissions.get({ $userId: session.user_id, $eventId: id });

      if (!userEvent) {
        return apiNotFound('Event not found');
      }

      if (userEvent.role_id !== 'owner') {
        return apiForbidden();
      }

      queryDeleteEvent.run({ $eventId: id });

      return apiData();
    }
  }
};
