import { sql } from 'bun';
import type { Routes } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';
import { apiBadRequest, apiData, apiForbidden, apiServerError, apiUnauthorized } from '@/server/utils/responses';

interface EventWithRole {
  id: string;
  name: string;
  role_id: string;
}

interface Permission {
  user_id: string;
  event_id: string;
  role_id: string;
}

export const eventsRoutes: Routes = {
  '/api/events': {
    GET: async (req) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const events: EventWithRole[] = await sql`
        SELECT events.id, events.name, permissions.role_id
        FROM events
        JOIN permissions ON events.id = permissions.event_id
        WHERE permissions.user_id = ${session.user_id}
        ORDER BY events.name ASC
      `;

      return apiData({ events });
    },
    POST: async (req) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return apiBadRequest('Invalid event name');
      }

      const id = Bun.randomUUIDv7();

      try {
        await sql`INSERT INTO events (id, name) VALUES (${id}, ${name.trim()})`;
        await sql`INSERT INTO permissions (user_id, event_id, role_id) VALUES (${session.user_id}, ${id}, ${'owner'})`;
        await sql`INSERT INTO runs (event_id, status, grace_period) VALUES (${id}, 'not_started', 2)`;
      } catch (error) {
        console.error('Error creating event:', error);

        return apiServerError('Failed to create event');
      }

      return apiData({ id, name: name.trim(), roleId: 'owner' });
    }
  },
  '/api/events/:id': {
    PATCH: async (req: BunRequest<'/api/events/:id'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return apiBadRequest('Invalid event name');
      }

      const id = req.params.id;
      const permissions: Permission[] = await sql`
        SELECT * FROM permissions
        WHERE user_id = ${session.user_id} AND event_id = ${id} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      await sql`UPDATE events SET name = ${name.trim()} WHERE id = ${id}`;

      return apiData({ id, name: name.trim() });
    },
    DELETE: async (req: BunRequest<'/api/events/:id'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const id = req.params.id;
      const permissions: Permission[] = await sql`
        SELECT * FROM permissions
        WHERE user_id = ${session.user_id} AND event_id = ${id} AND role_id = ${'owner'}
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      await sql`DELETE FROM events WHERE id = ${id}`;

      return apiData();
    }
  }
};
