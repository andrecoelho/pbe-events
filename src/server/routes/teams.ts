import { eventRole, json } from '@/server/http/middleware';
import { badRequest, route } from '@/server/http/route';
import { getLanguage, listLanguages } from '@/server/services/languages';
import { MANAGER_ROLES } from '@/server/services/permissions';
import { addTeam, deleteTeam, findTeamByName, listTeams, updateTeam } from '@/server/services/teams';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const NewTeam = z.object({
  name: z.string({ error: 'Team name is required' }).trim(),
  languageId: z.string({ error: 'Language is required' }).min(1, 'Language is required')
});
const TeamChange = NewTeam.extend({
  id: z.string({ error: 'Team not found' }),
  number: z.number({ error: 'Team number is required' }).int().positive('Team number must be positive')
});
const TeamId = z.object({ id: z.string({ error: 'Team not found' }) });

const managers = () => eventRole(...MANAGER_ROLES);

// The checks shared by adding and editing a team, in the order the old routes made them.
async function checkTeam(eventId: string, team: { name: string; languageId: string }, teamId?: string) {
  const language = await getLanguage(eventId, team.languageId);

  if (!language) {
    throw badRequest('Invalid language selected');
  }

  if (!team.name) {
    throw badRequest('Team name is required');
  }

  const sameName = await findTeamByName(eventId, team.name);

  if (sameName && sameName !== teamId) {
    throw badRequest('A team with this name already exists');
  }

  return language;
}

export const teamsRoutes: Routes = {
  '/api/events/:id/teams': {
    GET: route(managers(), async ({ event }) => {
      const [teams, languages] = await Promise.all([listTeams(event.id), listLanguages(event.id)]);

      return { eventName: event.name, teams, languages };
    }),

    POST: route(managers(), json(NewTeam), async ({ event, body }) => {
      const language = await checkTeam(event.id, body);
      const team = await addTeam(event.id, body.name, body.languageId);

      return { ...team, languageId: language.id, languageName: language.name };
    }),

    PATCH: route(managers(), json(TeamChange), async ({ event, body }) => {
      await checkTeam(event.id, body, body.id);
      await updateTeam(event.id, body.id, body);

      return {};
    }),

    DELETE: route(managers(), json(TeamId), async ({ event, body }) => {
      if (!(await deleteTeam(event.id, body.id))) {
        throw badRequest('Team not found');
      }

      return {};
    })
  }
};
