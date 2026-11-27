import { eventRole } from '@/server/http/middleware';
import { notFound, route } from '@/server/http/route';
import { getQuestionsWithAnswers } from '@/server/services/answers';
import { getLanguagesByCode } from '@/server/services/languages';
import { MANAGER_ROLES } from '@/server/services/permissions';
import { getRun } from '@/server/services/runs';
import { listSlides } from '@/server/services/slides';
import type { Routes } from '@/server/types';
import type { WebSocketServer } from '@/server/webSocket';

export function createRunsRoutes(_wsServer: WebSocketServer): Routes {
  return {
    // Everything the run screen needs to start: the run, questions with answers, slides and languages.
    '/api/events/:eventId/run': {
      GET: route(eventRole(...MANAGER_ROLES), async ({ event }) => {
        const run = await getRun(event.id);

        if (!run) {
          throw notFound();
        }

        const [questions, slides, languages] = await Promise.all([
          getQuestionsWithAnswers(event.id),
          listSlides(event.id),
          getLanguagesByCode(event.id)
        ]);

        return {
          eventName: event.name,
          titleRemarks: event.title_remarks,
          run: { status: run.status, gracePeriod: run.grace_period, activeItem: run.active_item },
          questions,
          slides,
          languages
        };
      })
    }
  };
}
