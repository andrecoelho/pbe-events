import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiBadRequest, apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import { type BunRequest, sql } from 'bun';

interface UserPermission {
  user_id: string;
  role_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

export const permissionRoutes: Routes = {
  '/api/events/:id/permissions': {
    GET: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const permissions: UserPermission[] = await sql`
        SELECT permissions.user_id, permissions.role_id, users.email, users.first_name, users.last_name, users.avatar_url
        FROM permissions
        JOIN users ON permissions.user_id = users.id
        WHERE permissions.event_id = ${eventId}
      `;

      return apiData({ eventName: event.name, permissions });
    },
    POST: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const { userId, roleId } = (await req.json()) as { userId: string; roleId: string };

      if (!userId || !roleId) {
        return apiBadRequest('userId and roleId are required');
      }

      await sql`INSERT INTO permissions (user_id, event_id, role_id) VALUES (${userId}, ${eventId}, ${roleId})`;

      return apiData();
    },

    PATCH: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const { userId, roleId } = (await req.json()) as { userId: string; roleId: string };

      if (!userId || !roleId) {
        return apiBadRequest('userId and roleId are required');
      }

      if (roleId === 'owner') {
        return apiBadRequest('Cannot assign owner role');
      }

      await sql`UPDATE permissions SET role_id = ${roleId} WHERE user_id = ${userId} AND event_id = ${eventId}`;

      return apiData();
    },

    DELETE: async (req: BunRequest<'/api/events/:id/permissions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const { userId } = (await req.json()) as { userId: string };

      if (!userId) {
        return apiBadRequest('userId is required');
      }

      await sql`DELETE FROM permissions WHERE user_id = ${userId} AND event_id = ${eventId}`;

      return apiData();
    }
  }
};
