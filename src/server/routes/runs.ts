import { getEventForRoles, MANAGER_ROLES } from '@/server/services/permissions';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { getQuestionsWithAnswers } from '@/server/services/answers';
import { getLanguagesByCode } from '@/server/services/languages';
import { getRun } from '@/server/services/runs';
import { listSlides } from '@/server/services/slides';
import { apiData, apiForbidden, apiNotFound, apiServerError, apiUnauthorized } from '@/server/utils/responses';
import type { WebSocketServer } from '@/server/webSocket';
import type { BunRequest } from 'bun';

export function createRunsRoutes(_wsServer: WebSocketServer): Routes {
  return {
    '/api/events/:eventId/run': {
      GET: async (req: BunRequest<'/api/events/:eventId/run'>) => {
        const session = await getSession(req);

        if (!session) {
          return apiUnauthorized();
        }

        const { eventId } = req.params;
        const event = await getEventForRoles(eventId, session.user_id, MANAGER_ROLES);

        if (!event) {
          return apiForbidden();
        }

        try {
          const run = await getRun(eventId);

          if (!run) {
            return apiNotFound();
          }

          const [questions, slides, languages] = await Promise.all([
            getQuestionsWithAnswers(eventId),
            listSlides(eventId),
            getLanguagesByCode(eventId)
          ]);

          return apiData({
            eventName: event.name,
            titleRemarks: event.title_remarks,
            run: {
              status: run.status,
              gracePeriod: run.grace_period,
              activeItem: run.active_item
            },
            questions,
            slides,
            languages
          });
        } catch (error) {
          console.log('Error fetching run data:', error);
          return apiServerError();
        }
      }
    }
  };
}
