import { sql } from 'bun';
import type { Routes } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';
import type { WebSocketServer } from '@/server/webSocket';
import {
  apiBadRequest,
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';

export function createRunsRoutes(wsServer: WebSocketServer): Routes {
  return {
    '/api/events/:eventId/run': {
      GET: async (req: BunRequest<'/api/events/:eventId/run'>) => {
        const session = await getSession(req);

        if (!session) {
          return apiUnauthorized();
        }

        const { eventId } = req.params;

        try {
          // Check permissions
          const permissions: { role_id: string }[] = await sql`
            SELECT role_id FROM permissions
            WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin', 'judge')
          `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          // Get run
          const runs: {
            event_id: string;
            status: string;
            grace_period: number;
            has_timer: boolean;
            active_id: string | null;
            active_type: string | null;
            active_start_time: string | null;
          }[] = await sql`
            SELECT event_id, status, grace_period, has_timer, active_id, active_type, active_start_time
            FROM runs
            WHERE event_id = ${eventId}
          `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;

          // Get active item details if exists
          let activeQuestion = null;
          let activeSlide = null;

          if (run.active_id && run.active_type === 'question') {
            const questions: {
              id: string;
              number: number;
              type: string;
              max_points: number;
              seconds: number;
            }[] = await sql`
              SELECT id, number, type, max_points, seconds
              FROM questions
              WHERE id = ${run.active_id}
            `;

            if (questions.length > 0) {
              const q = questions[0]!;

              activeQuestion = {
                id: q.id,
                number: q.number,
                type: q.type,
                maxPoints: q.max_points,
                seconds: q.seconds
              };
            }
          } else if (run.active_id && run.active_type === 'slide') {
            const slides: {
              id: string;
              number: number;
              content: string;
            }[] = await sql`
              SELECT id, number, content
              FROM slides
              WHERE id = ${run.active_id}
            `;

            if (slides.length > 0) {
              const s = slides[0]!;

              activeSlide = {
                id: s.id,
                number: s.number,
                content: s.content
              };
            }
          }

          return apiData({
            run: {
              eventId: run.event_id,
              status: run.status,
              gracePeriod: run.grace_period,
              hasTimer: run.has_timer,
              activeId: run.active_id,
              activeType: run.active_type,
              activeStartTime: run.active_start_time,
              activeQuestion,
              activeSlide
            }
          });
        } catch (error) {
          console.error('Error fetching run:', error);
          return apiServerError();
        }
      },

      PATCH: async (req: BunRequest<'/api/events/:eventId/run'>) => {
        const session = await getSession(req);

        if (!session) {
          return apiUnauthorized();
        }

        const { eventId } = req.params;

        try {
          const body = await req.json();
          const { action, gracePeriod } = body;

          if (!action || !['start', 'complete', 'updateGracePeriod', 'reset'].includes(action)) {
            return apiBadRequest('Invalid action. Must be one of: start, complete, updateGracePeriod, reset');
          }

          // Get run and check permissions
          const runs: { status: string }[] = await sql`SELECT status FROM runs WHERE event_id = ${eventId}`;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
            SELECT role_id FROM permissions
            WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
          `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          // Handle different actions
          switch (action) {
            case 'start':
              if (run.status !== 'not_started') {
                return apiBadRequest('Run has already been started');
              }

              await sql`
                UPDATE runs
                SET status = 'in_progress'
                WHERE event_id = ${eventId}
              `;

              return apiData();

            case 'complete':
              if (run.status === 'completed') {
                return apiBadRequest('Run is already completed');
              }

              await sql`UPDATE runs SET status = 'completed' WHERE event_id = ${eventId}`;

              // Send RUN_COMPLETED message to all teams before closing connections
              if (wsServer.hasConnection(eventId)) {
                const connection = wsServer.getConnection(eventId);

                if (connection) {
                  const message = JSON.stringify({
                    type: 'RUN_COMPLETED'
                  });

                  for (const teamWs of connection.teams.values()) {
                    teamWs.send(message);
                    teamWs.close();
                  }
                }
              }

              return apiData();

            case 'updateGracePeriod':
              if (typeof gracePeriod !== 'number' || gracePeriod < 0) {
                return apiBadRequest('Grace period must be a non-negative number');
              }

              await sql`UPDATE runs SET grace_period = ${gracePeriod} WHERE event_id = ${eventId}`;

              // Update cache and broadcast to host if connection exists
              if (wsServer.hasConnection(eventId)) {
                const connection = wsServer.getConnection(eventId);

                if (connection && connection.run) {
                  connection.run.gracePeriod = gracePeriod;
                }

                // Send to host only
                const message = JSON.stringify({
                  type: 'GRACE_PERIOD_UPDATED',
                  gracePeriod
                });

                connection?.host?.send(message);
              }

              return apiData();

            case 'reset':
              if (run.status !== 'completed') {
                return apiBadRequest('Run must be completed before it can be reset');
              }

              // Delete all answers for this event
              await sql`
                DELETE FROM answers
                WHERE team_id IN (
                  SELECT id FROM teams WHERE event_id = ${eventId}
                )
              `;

              // Reset the run
              await sql`
                UPDATE runs
                SET status = 'not_started',
                    active_id = NULL,
                    active_type = NULL,
                    active_start_time = NULL
                WHERE event_id = ${eventId}
              `;

              return apiData();

            default:
              return apiBadRequest('Invalid action');
          }
        } catch (error) {
          console.error('Error updating run:', error);
          return apiServerError();
        }
      }
    }
  };
}
