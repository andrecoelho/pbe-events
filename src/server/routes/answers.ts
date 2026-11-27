import { eventRole } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { getQuestionsWithAnswers } from '@/server/services/answers';
import { ALL_ROLES } from '@/server/services/permissions';
import type { Routes } from '@/server/types';

export const answersRoutes: Routes = {
  '/api/events/:id/answers': {
    GET: route(eventRole(...ALL_ROLES), async ({ event }) => ({
      eventName: event.name,
      questions: await getQuestionsWithAnswers(event.id)
    }))
  }
};
