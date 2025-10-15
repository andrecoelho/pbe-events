import { db } from '@/server/db';
import type { Permission, Routes } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';

const querySelectEventsByUserId = db.query<Event[], { $userId: string }>(
  `SELECT events.*
   FROM events
   JOIN permissions ON events.id = permissions.event_id
   WHERE permissions.user_id = $userId`
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
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401
        });
      }

      const events = querySelectEventsByUserId.all({ $userId: session.user_id });

      return new Response(JSON.stringify(events), {
        headers: { 'Content-Type': 'application/json' }
      });
    },
    POST: async (req) => {
      const session = getSession(req);

      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401
        });
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return new Response(JSON.stringify({ error: 'Invalid event name' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      const id = Bun.randomUUIDv7();
      console.log('SESSION', session);

      try {
        queryInsertEvent.run({ $id: id, $name: name.trim() });

        queryInsertPermission.run({ $userId: session.user_id, $eventId: id, $roleId: 'owner' });
      } catch (error) {
        console.error('Error creating event:', error);

        return new Response(JSON.stringify({ error: 'Failed to create event' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500
        });
      }

      return new Response(JSON.stringify({ ok: true, id, name: name.trim() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
  '/api/events/:id': {
    PATCH: async (req: BunRequest<'/api/events/:id'>) => {
      const session = getSession(req);

      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401
        });
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return new Response(JSON.stringify({ error: 'Invalid event name' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      const id = req.params.id;
      const userEvent = querySelectPermissions.get({ $userId: session.user_id, $eventId: id });

      if (!userEvent) {
        return new Response(JSON.stringify({ error: 'Event not found' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 404
        });
      }

      if (userEvent.role_id !== 'owner' && userEvent.role_id !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 403
        });
      }

      queryUpdateEventName.run({ $eventId: id, $name: name.trim() });

      return new Response(JSON.stringify({ ok: true, id, name: name.trim() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    },
    DELETE: (req: BunRequest<'/api/events/:id'>) => {
      const session = getSession(req);

      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401
        });
      }

      const id = req.params.id;
      const userEvent = querySelectPermissions.get({ $userId: session.user_id, $eventId: id });

      if (!userEvent) {
        return new Response(JSON.stringify({ error: 'Event not found' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 404
        });
      }

      if (userEvent.role_id !== 'owner') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 403
        });
      }

      queryDeleteEvent.run({ $eventId: id });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
