import { eventRole } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { MANAGER_ROLES } from '@/server/services/permissions';
import { getAnswerExport, getMaxPoints, getTeamScores } from '@/server/services/results';
import type { Routes } from '@/server/types';

export const resultsRoutes: Routes = {
  '/api/events/:id/results': {
    GET: route(eventRole(...MANAGER_ROLES), async ({ event }) => {
      const [maxPoints, teams] = await Promise.all([getMaxPoints(event.id), getTeamScores(event.id)]);

      return { eventName: event.name, maxPoints, teams };
    })
  },

  '/api/events/:id/results/raw': {
    GET: route(eventRole(...MANAGER_ROLES), async ({ event }) => ({ answers: await getAnswerExport(event.id) }))
  }
};
