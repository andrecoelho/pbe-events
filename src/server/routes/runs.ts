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
    '/api/events/:eventId/runs': {
      POST: async (req: BunRequest<'/api/events/:eventId/runs'>) => {
        const session = await getSession(req);
        if (!session) return apiUnauthorized();

        const { eventId } = req.params;

        try {
          const body = await req.json();
          const gracePeriod = typeof body.gracePeriod === 'number' ? body.gracePeriod : 2;

          if (gracePeriod < 0) {
            return apiBadRequest('Grace period must be non-negative');
          }

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          // Check if there's already an active run for this event
          const existingRuns: { id: string }[] = await sql`
          SELECT id FROM runs
          WHERE event_id = ${eventId} AND status IN ('not_started', 'in_progress')
        `;

          if (existingRuns.length > 0) {
            return apiBadRequest('An active run already exists for this event');
          }

          const runId = Bun.randomUUIDv7();
          const result: {
            id: string;
            event_id: string;
            status: string;
            grace_period: number;
            started_at: string | null;
            has_timer: boolean;
            active_question_id: string | null;
            question_start_time: string | null;
            created_at: string;
          }[] = await sql`
          INSERT INTO runs (id, event_id, status, grace_period, started_at, has_timer)
          VALUES (${runId}, ${eventId}, 'not_started', ${gracePeriod}, NULL, true)
          RETURNING id, event_id, status, grace_period, started_at, has_timer, active_question_id, question_start_time, created_at
        `;

          if (result.length === 0) {
            return apiServerError();
          }

          const run = result[0]!;
          return apiData({
            run: {
              id: run.id,
              eventId: run.event_id,
              status: run.status,
              gracePeriod: run.grace_period,
              startedAt: run.started_at,
              hasTimer: run.has_timer,
              activeQuestionId: run.active_question_id,
              questionStartTime: run.question_start_time,
              createdAt: run.created_at
            },
            ok: true
          });
        } catch (error) {
          console.error('Error creating run:', error);
          return apiServerError();
        }
      }
    },

    '/api/runs/:runId': {
      GET: async (req: BunRequest<'/api/runs/:runId'>) => {
        const session = await getSession(req);
        if (!session) return apiUnauthorized();

        const { runId } = req.params;

        try {
          const runs: {
            id: string;
            event_id: string;
            status: string;
            grace_period: number;
            started_at: string | null;
            has_timer: boolean;
            active_question_id: string | null;
            question_start_time: string | null;
            created_at: string;
          }[] = await sql`
          SELECT id, event_id, status, grace_period, started_at, has_timer,
                 active_question_id, question_start_time, created_at
          FROM runs
          WHERE id = ${runId}
        `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${run.event_id} AND role_id IN ('owner', 'admin', 'judge')
        `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          // Get active question details if exists
          let activeQuestion = null;
          if (run.active_question_id) {
            const questions: {
              id: string;
              number: number;
              type: string;
              max_points: number;
              seconds: number;
            }[] = await sql`
            SELECT id, number, type, max_points, seconds
            FROM questions
            WHERE id = ${run.active_question_id}
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
          }

          return apiData({
            run: {
              id: run.id,
              eventId: run.event_id,
              status: run.status,
              gracePeriod: run.grace_period,
              startedAt: run.started_at,
              hasTimer: run.has_timer,
              activeQuestionId: run.active_question_id,
              questionStartTime: run.question_start_time,
              createdAt: run.created_at,
              activeQuestion
            }
          });
        } catch (error) {
          console.error('Error fetching run:', error);
          return apiServerError();
        }
      }
    },

    '/api/runs/:runId/start': {
      PATCH: async (req: BunRequest<'/api/runs/:runId/start'>) => {
        const session = await getSession(req);
        if (!session) return apiUnauthorized();

        const { runId } = req.params;

        try {
          // Get run and check permissions
          const runs: { event_id: string; status: string }[] = await sql`
          SELECT event_id, status FROM runs WHERE id = ${runId}
        `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;

          if (run.status !== 'not_started') {
            return apiBadRequest('Run has already been started');
          }

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${run.event_id} AND role_id IN ('owner', 'admin')
        `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          await sql`
          UPDATE runs
          SET status = 'in_progress', started_at = CURRENT_TIMESTAMP
          WHERE id = ${runId}
        `;

          return apiData({ ok: true });
        } catch (error) {
          console.error('Error starting run:', error);
          return apiServerError();
        }
      }
    },

    '/api/runs/:runId/grace-period': {
      PATCH: async (req: BunRequest<'/api/runs/:runId/grace-period'>) => {
        const session = await getSession(req);
        if (!session) return apiUnauthorized();

        const { runId } = req.params;

        try {
          const body = await req.json();
          const { gracePeriod } = body;

          if (typeof gracePeriod !== 'number' || gracePeriod < 0) {
            return apiBadRequest('Grace period must be a non-negative number');
          }

          // Get run and check permissions
          const runs: { event_id: string }[] = await sql`
          SELECT event_id FROM runs WHERE id = ${runId}
        `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const eventId = runs[0]!.event_id;

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          await sql`
          UPDATE runs SET grace_period = ${gracePeriod} WHERE id = ${runId}
        `;

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

            if (connection) {
              connection.host.forEach((hostWs: any) => {
                hostWs.send(message);
              });
            }
          }

          return apiData({ ok: true });
        } catch (error) {
          console.error('Error updating grace period:', error);
          return apiServerError();
        }
      }
    },

    '/api/runs/:runId/complete': {
      PATCH: async (req: BunRequest<'/api/runs/:runId/complete'>) => {
        const session = await getSession(req);
        if (!session) return apiUnauthorized();

        const { runId } = req.params;

        try {
          // Get run and check permissions
          const runs: { event_id: string; status: string }[] = await sql`
          SELECT event_id, status FROM runs WHERE id = ${runId}
        `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0];

          if (!run || run.status === 'completed') {
            return apiBadRequest('Run is already completed');
          }

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${run.event_id} AND role_id IN ('owner', 'admin')
        `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          await sql`
          UPDATE runs SET status = 'completed' WHERE id = ${runId}
        `;

          return apiData({ ok: true });
        } catch (error) {
          console.error('Error completing run:', error);
          return apiServerError();
        }
      }
    }
  };
}
