import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import {
  apiBadRequest,
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

          return apiData({
            eventName: event.name,
            run: {
              status: run.status,
              gracePeriod: run.grace_period,
              activeItem: run.active_item
            }
          });
        } catch (error) {
          return apiServerError();
        }
      }
    }
  };
}
