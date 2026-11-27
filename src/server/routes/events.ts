import { auth, eventRole, json } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { createEvent, deleteEvent, duplicateEvent, listEventsForUser, renameEvent } from '@/server/services/events';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const EventName = z.object({
  name: z.string({ error: 'Invalid event name' }).trim().min(1, 'Invalid event name')
});

export const eventsRoutes: Routes = {
  '/api/events': {
    GET: route(auth(), async ({ user }) => ({ events: await listEventsForUser(user.id) })),

    POST: route(auth(), json(EventName), async ({ user, body }) => await createEvent(user.id, body.name))
  },

  '/api/events/:id': {
    PATCH: route(eventRole('owner', 'admin'), json(EventName), async ({ event, body }) => {
      await renameEvent(event.id, body.name);
      return { id: event.id, name: body.name };
    }),

    DELETE: route(eventRole('owner'), async ({ event }) => {
      await deleteEvent(event.id);
      return {};
    })
  },

  '/api/events/:id/duplicate': {
    POST: route(
      eventRole('owner', 'admin'),
      json(EventName),
      async ({ user, event, body }) => await duplicateEvent(event.id, user.id, body.name)
    )
  }
};
