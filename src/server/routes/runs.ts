import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { getQuestionsWithAnswers } from '@/server/utils/getQuestionsWithAnswers';
import { apiData, apiForbidden, apiNotFound, apiServerError, apiUnauthorized } from '@/server/utils/responses';
import type { WebSocketServer } from '@/server/webSocket';
import type { ActiveItem } from '@/types';
import type { BunRequest } from 'bun';
import { sql } from 'bun';

export function createRunsRoutes(wsServer: WebSocketServer): Routes {
  return {
    '/api/events/:eventId/run': {
      GET: async (req: BunRequest<'/api/events/:eventId/run'>) => {
        const session = await getSession(req);

        if (!session) {
          return apiUnauthorized();
        }

        const { eventId } = req.params;
        const event = await querySelectEvent(eventId, session.user_id);

        if (!event) {
          return apiForbidden();
        }

        try {
          // Get run with active_item JSONB
          const runs: {
            status: string;
            grace_period: number;
            active_item: ActiveItem | null;
          }[] = await sql`
            SELECT status, grace_period, active_item
            FROM runs
            WHERE event_id = ${eventId}
          `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;
          const questions = await getQuestionsWithAnswers(eventId);

          // Get slides
          const slides: {
            id: string;
            number: number;
            content: string;
          }[] = await sql`
            SELECT id, number, content
            FROM slides
            WHERE event_id = ${eventId}
            ORDER BY number
          `;

          // Get languages
          const languages: {
            id: string;
            code: string;
            name: string;
          }[] = await sql`
            SELECT id, code, name
            FROM languages
            WHERE event_id = ${eventId}
          `;

          return apiData({
            eventName: event.name,
            titleRemarks: event.title_remarks,
            run: {
              status: run.status,
              gracePeriod: run.grace_period,
              activeItem: run.active_item
            },
            questions,
            slides: slides.map((s) => ({
              id: s.id,
              number: s.number,
              content: s.content
            })),
            languages: Object.fromEntries(languages.map((l) => [l.code, { id: l.id, code: l.code, name: l.name }]))
          });
        } catch (error) {
          console.log('Error fetching run data:', error);
          return apiServerError();
        }
      }
    }
  };
}
