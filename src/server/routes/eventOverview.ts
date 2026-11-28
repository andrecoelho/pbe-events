// An event's home page (#69).
import { eventRole } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { getEventCounts } from '@/server/services/eventOverview';
import { MANAGER_ROLES } from '@/server/services/permissions';
import { listTeams } from '@/server/services/teams';
import type { Routes } from '@/server/types';
import type { WebSocketServer } from '@/server/webSocket';
import type { EventOverviewResponse } from '@/types';

export const createEventOverviewRoutes = (wsServer: WebSocketServer): Routes => ({
  '/api/events/:id/overview': {
    GET: route(eventRole(...MANAGER_ROLES), async ({ event }): Promise<EventOverviewResponse> => {
      const [{ counts, runStatus }, teams] = await Promise.all([getEventCounts(event.id), listTeams(event.id)]);

      return {
        counts,
        runStatus,
        teamsConnected: teams.filter((team) => wsServer.teamConnection(event.id, team.id).status === 'connected')
          .length,
        teams: teams.map((team) => ({ number: team.number, name: team.name, joinCode: team.join_code }))
      };
    })
  }
});
