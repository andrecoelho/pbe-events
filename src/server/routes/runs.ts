import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import {
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';
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

          // Get questions with translations
          const questions: {
            id: string;
            number: number;
            type: string;
            max_points: number;
            seconds: number;
            language_code: string;
            prompt: string;
          }[] = await sql`
            SELECT
              q.id,
              q.number,
              q.type,
              q.max_points,
              q.seconds,
              l.code as language_code,
              t.prompt
            FROM questions q
            LEFT JOIN translations t ON q.id = t.question_id
            LEFT JOIN languages l ON t.language_id = l.id
            WHERE q.event_id = ${eventId}
            ORDER BY q.number, l.code
          `;

          // Group translations by question
          const questionsMap = new Map();

          for (const q of questions) {
            if (!questionsMap.has(q.id)) {
              questionsMap.set(q.id, {
                id: q.id,
                number: q.number,
                type: q.type,
                maxPoints: q.max_points,
                seconds: q.seconds,
                translations: []
              });
            }

            if (q.language_code && q.prompt) {
              questionsMap.get(q.id).translations.push({
                languageCode: q.language_code,
                prompt: q.prompt
              });
            }
          }

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
            code: string;
            name: string;
          }[] = await sql`
            SELECT code, name
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
            questions: Array.from(questionsMap.values()),
            slides: slides.map(s => ({
              id: s.id,
              number: s.number,
              content: s.content
            })),
            languages: Object.fromEntries(languages.map(l => [l.code, l.name]))
          });
        } catch (error) {
          console.log('Error fetching run data:', error);
          return apiServerError();
        }
      }
    }
  };
}
