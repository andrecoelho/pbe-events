import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { getQuestionsWithAnswers } from '@/server/utils/getQuestionsWithAnswers';
import { apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import { sql, type BunRequest } from 'bun';

export const answersRoutes: Routes = {
  '/api/events/:id/answers': {
    GET: async (req: BunRequest<'/api/events/:id/answers'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;

      const result: { id: string; name: string }[] = await sql`
          SELECT events.id, events.name
          FROM events
          JOIN permissions ON events.id = permissions.event_id
          WHERE permissions.user_id = ${session.user_id} AND events.id = ${eventId} AND permissions.role_id IN ('owner', 'admin', 'judge')
        `;

      const event = result[0] || null;

      if (!event) {
        return apiForbidden();
      }

      const questions = await getQuestionsWithAnswers(eventId);

      return apiData({ eventName: event.name, questions });
    }
  }
};
