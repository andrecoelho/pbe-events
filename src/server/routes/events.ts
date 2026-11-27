import type { Routes } from '@/server/types';
import { getSession } from '@/server/session';
import { createEvent, deleteEvent, duplicateEvent, listEventsForUser, renameEvent } from '@/server/services/events';
import { getEventForRoles, MANAGER_ROLES } from '@/server/services/permissions';
import type { BunRequest } from 'bun';
import { apiBadRequest, apiData, apiForbidden, apiServerError, apiUnauthorized } from '@/server/utils/responses';

export const eventsRoutes: Routes = {
  '/api/events': {
    GET: async (req) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const events = await listEventsForUser(session.user_id);

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

      try {
        return apiData(await createEvent(session.user_id, name.trim()));
      } catch (error) {
        console.error('Error creating event:', error);

        return apiServerError('Failed to create event');
      }
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

      if (!(await getEventForRoles(id, session.user_id, MANAGER_ROLES))) {
        return apiForbidden();
      }

      await renameEvent(id, name.trim());

      return apiData({ id, name: name.trim() });
    },
    DELETE: async (req: BunRequest<'/api/events/:id'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const id = req.params.id;

      if (!(await getEventForRoles(id, session.user_id, ['owner']))) {
        return apiForbidden();
      }

      await deleteEvent(id);

      return apiData();
    }
  },
  '/api/events/:id/duplicate': {
    POST: async (req: BunRequest<'/api/events/:id/duplicate'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const sourceEventId = req.params.id;

      if (!(await getEventForRoles(sourceEventId, session.user_id, MANAGER_ROLES))) {
        return apiForbidden();
      }

      const { name } = await req.json();

      if (!name || typeof name !== 'string' || name.trim() === '') {
        return apiBadRequest('Invalid event name');
      }

      try {
        return apiData(await duplicateEvent(sourceEventId, session.user_id, name.trim()));
      } catch (error) {
        console.error('Error duplicating event:', error);
        return apiServerError('Failed to duplicate event');
      }
    }
  }
};
