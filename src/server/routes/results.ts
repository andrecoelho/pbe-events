import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';
import { sql } from 'bun';

export const resultsRoutes: Routes = {
  '/api/events/:id/results': {
    GET: async (req: BunRequest<'/api/events/:id/results'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      // Calculate max possible points for the event
      const maxPointsResult: { total: number }[] = await sql`
        SELECT COALESCE(SUM(max_points), 0) as total
        FROM questions
        WHERE event_id = ${eventId}
      `;

      const maxPoints = maxPointsResult[0]?.total || 0;

      // Get team scores
      const teams: {
        id: string;
        number: number;
        name: string;
        language_id: string;
        language_name: string;
        total_points: number;
      }[] = await sql`
        SELECT
          t.id,
          t.number,
          t.name,
          t.language_id,
          l.name as language_name,
          COALESCE(SUM(COALESCE(a.points_awarded, a.auto_points_awarded, 0)), 0) as total_points
        FROM teams t
        LEFT JOIN languages l ON l.id = t.language_id
        LEFT JOIN answers a ON a.team_id = t.id
        LEFT JOIN questions q ON q.id = a.question_id AND q.event_id = ${eventId}
        WHERE t.event_id = ${eventId}
        GROUP BY t.id, t.number, t.name, t.language_id, l.name
        ORDER BY t.number ASC
      `;

      return apiData({
        eventName: event.name,
        maxPoints,
        teams,
      });
    },
  },

  '/api/events/:id/results/raw': {
    GET: async (req: BunRequest<'/api/events/:id/results/raw'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      // Get raw answer data for CSV export
      const answers: {
        question_number: number;
        team_number: number;
        team_name: string;
        language_name: string;
        answer: string;
        points: number;
      }[] = await sql`
        SELECT
          q.number as question_number,
          t.number as team_number,
          t.name as team_name,
          l.name as language_name,
          a.answer,
          COALESCE(a.points_awarded, a.auto_points_awarded, 0) as points
        FROM answers a
        JOIN questions q ON q.id = a.question_id
        JOIN teams t ON t.id = a.team_id
        LEFT JOIN languages l ON l.id = t.language_id
        WHERE q.event_id = ${eventId}
        ORDER BY q.number, t.number
      `;

      return apiData({ answers });
    },
  },
};
