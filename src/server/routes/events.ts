import { auth, eventRole, json } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { createEvent, deleteEvent, duplicateEvent, listEventsForUser, renameEvent } from '@/server/services/events';
import { getEventCountsFor } from '@/server/services/eventOverview';
import { MANAGER_ROLES } from '@/server/services/permissions';
import type { Routes } from '@/server/types';
import type { EventListEntry } from '@/types';
import { z } from 'zod';

const EventName = z.object({
  name: z.string({ error: 'Enter a name for the event.' }).trim().min(1, 'Enter a name for the event.')
});

export const eventsRoutes: Routes = {
  '/api/events': {
    // The user's events (#71), with what each still needs before it can run for the ones they manage.
    GET: route(auth(), async ({ user }): Promise<{ events: EventListEntry[] }> => {
      const events = await listEventsForUser(user.id);
      const counts = await getEventCountsFor(events.map((event) => event.id));

      return {
        events: events.map((event) => ({
          id: event.id,
          name: event.name,
          roleId: event.role_id,
          createdAt: event.created_at.toISOString(),
          runStatus: counts.get(event.id)?.runStatus ?? 'not_started',
          counts: MANAGER_ROLES.includes(event.role_id) ? (counts.get(event.id)?.counts ?? null) : null
        }))
      };
    }),

    POST: route(auth(), json(EventName), async ({ user, body }) => await createEvent(user.id, body.name))
  },

  '/api/events/:id': {
    // The event's name and the user's role on it, for the event workspace's menu (#15).
    GET: route(eventRole('owner', 'admin', 'judge'), async ({ event }) => ({
      id: event.id,
      name: event.name,
      roleId: event.role_id
    })),

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
