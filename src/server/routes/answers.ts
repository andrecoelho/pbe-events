import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { getQuestionsWithAnswers } from '@/server/services/answers';
import { ALL_ROLES, getEventForRoles } from '@/server/services/permissions';
import { apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

export const answersRoutes: Routes = {
  '/api/events/:id/answers': {
    GET: async (req: BunRequest<'/api/events/:id/answers'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;

      const event = await getEventForRoles(eventId, session.user_id, ALL_ROLES);

      if (!event) {
        return apiForbidden();
      }

      const questions = await getQuestionsWithAnswers(eventId);

      return apiData({ eventName: event.name, questions });
    }
  }
};
