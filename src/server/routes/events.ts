import { db } from '@/server/db';
import type { UserEvent, Routes } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';

const selectEventsByUserQuery = db.query<Event[], { $userId: string }>(
  `SELECT events.*
   FROM events
   JOIN user_events ON events.id = user_events.event_id
   WHERE user_events.user_id = $userId`
);

const insertEventQuery = db.query<{}, { $id: string; $name: string }>(
  `INSERT INTO events (id, name) VALUES ($id, $name)`
);

const insertUserEventQuery = db.query<{}, { $userId: string; $eventId: string; $roleId: string }>(
  `INSERT INTO user_events (user_id, event_id, role_id) VALUES ($userId, $eventId, $roleId)`
);

const selectUserEventQuery = db.query<UserEvent, { $userId: string; $eventId: string }>(
  `SELECT * FROM user_events WHERE user_id = $userId AND event_id = $eventId`
);

const deleteUserEventQuery = db.query<{}, { $userId: string; $eventId: string }>(
  `DELETE FROM user_events WHERE user_id = $userId AND event_id = $eventId`
);

const deleteEventQuery = db.query<{}, { $eventId: string }>(`DELETE FROM events WHERE id = $eventId`);

const updateEventNameQuery = db.query<{}, { $eventId: string; $name: string }>(
  `UPDATE events SET name = $name WHERE id = $eventId`
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

      const events = selectEventsByUserQuery.all({ $userId: session.user_id });

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
        insertEventQuery.run({ $id: id, $name: name.trim() });

        insertUserEventQuery.run({ $userId: session.user_id, $eventId: id, $roleId: 'owner' });
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
      const userEvent = selectUserEventQuery.get({ $userId: session.user_id, $eventId: id });

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

      updateEventNameQuery.run({ $eventId: id, $name: name.trim() });

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
      const userEvent = selectUserEventQuery.get({ $userId: session.user_id, $eventId: id });

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

      deleteEventQuery.run({ $eventId: id });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
