import { eventRole, json } from '@/server/http/middleware';
import { notFound, route } from '@/server/http/route';
import { setTitleRemarks } from '@/server/services/events';
import { MANAGER_ROLES } from '@/server/services/permissions';
import { addSlide, deleteSlide, getSlideEventId, listSlidesWithDates, updateSlide } from '@/server/services/slides';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const NewSlide = z.object({ content: z.string({ error: 'Content must be a string' }) });
const SlideChange = z.object({ content: z.string({ error: 'Content is required' }).min(1, 'Content is required') });
const TitleRemarks = z.object({ titleRemarks: z.string({ error: 'Title remarks must be a string' }) });

const managers = () => eventRole(...MANAGER_ROLES);

// For /api/slides/:slideId, the permission check is on the slide's event.
const slideManagers = () =>
  eventRole(...MANAGER_ROLES, {
    eventId: async ({ params }) => {
      const eventId = await getSlideEventId(params.slideId ?? '');

      if (!eventId) {
        throw notFound('Slide not found');
      }

      return eventId;
    }
  });

export const slidesRoutes: Routes = {
  '/api/events/:eventId/slides': {
    GET: route(managers(), async ({ event }) => ({
      eventName: event.name,
      titleRemarks: event.title_remarks || '',
      slides: await listSlidesWithDates(event.id)
    })),

    POST: route(managers(), json(NewSlide), async ({ event, body }) => {
      const slide = await addSlide(event.id, body.content);
      return { slideId: slide.id, number: slide.number };
    })
  },

  '/api/slides/:slideId': {
    PATCH: route(slideManagers(), json(SlideChange), async ({ params, body }) => {
      await updateSlide(params.slideId!, body.content);
      return {};
    }),

    DELETE: route(slideManagers(), async ({ event, params }) => {
      await deleteSlide(event.id, params.slideId!);
      return {};
    })
  },

  '/api/events/:eventId/title-remarks': {
    PATCH: route(managers(), json(TitleRemarks), async ({ event, body }) => {
      await setTitleRemarks(event.id, body.titleRemarks);
      return {};
    })
  }
};
