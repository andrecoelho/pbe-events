import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiBadRequest, apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import type { BunRequest } from 'bun';
import { sql } from 'bun';

interface Team {
  id: string;
  name: string;
  number: number;
  event_id: string;
  language_id: string;
  language_name: string;
  created_at: number;
}

interface Language {
  id: string;
  code: string;
  name: string;
}

export const teamsRoutes: Routes = {
  '/api/events/:id/teams': {
    GET: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const teams: Team[] = await sql`
        SELECT
          t.id,
          t.name,
          t.number,
          t.event_id,
          t.language_id,
          l.name as language_name,
          t.created_at
        FROM teams t
        LEFT JOIN languages l ON l.id = t.language_id
        WHERE t.event_id = ${eventId}
        ORDER BY t.number
      `;

      const languages: Language[] = await sql`
        SELECT id, code, name
        FROM languages
        WHERE event_id = ${eventId}
        ORDER BY code
      `;

      return apiData({ eventName: event.name, teams, languages });
    },

    POST: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const body = (await req.json()) as { name: string; languageId: string };
      const name = body.name.trim();
      const languageId = body.languageId;

      if (!languageId) {
        return apiBadRequest('Language is required');
      }

      // Validate language exists and belongs to this event
      const languages: { id: string }[] = await sql`
        SELECT id FROM languages WHERE id = ${languageId} AND event_id = ${eventId}
      `;

      if (languages.length === 0) {
        return apiBadRequest('Invalid language selected');
      }

      if (!name) {
        return apiBadRequest('Team name is required');
      }

      const existingTeams: { id: string }[] = await sql`
        SELECT id FROM teams WHERE event_id = ${eventId} AND name = ${name}
      `;

      if (existingTeams.length > 0) {
        return apiBadRequest('A team with this name already exists');
      }

      const teams: Team[] = await sql`
        SELECT id, name, number, event_id, created_at
        FROM teams
        WHERE event_id = ${eventId}
      `;

      const teamNumber = teams.length > 0 ? Math.max(...teams.map((t: Team) => t.number)) + 1 : 1;

      const id = Bun.randomUUIDv7();

      await sql`INSERT INTO teams (id, event_id, name, number, language_id) VALUES (${id}, ${eventId}, ${name}, ${teamNumber}, ${languageId})`;

      // Fetch language name for response
      const languageResult: { name: string }[] = await sql`SELECT name FROM languages WHERE id = ${languageId}`;
      const languageName = languageResult[0]?.name || '';

      return apiData({ id, number: teamNumber, languageId, languageName });
    },

    PATCH: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const body = (await req.json()) as { id: string; name: string; number: number; languageId: string };
      const name = body.name.trim();
      const languageId = body.languageId;

      if (!languageId) {
        return apiBadRequest('Language is required');
      }

      // Validate language exists and belongs to this event
      const languages: { id: string }[] = await sql`
        SELECT id FROM languages WHERE id = ${languageId} AND event_id = ${eventId}
      `;

      if (languages.length === 0) {
        return apiBadRequest('Invalid language selected');
      }

      if (!name) {
        return apiBadRequest('Team name is required');
      }

      const existingTeams: { id: string }[] = await sql`
        SELECT id FROM teams WHERE event_id = ${eventId} AND name = ${name}
      `;

      if (existingTeams.length > 0 && existingTeams[0]!.id !== body.id) {
        return apiBadRequest('A team with this name already exists');
      }

      await sql`UPDATE teams SET name = ${name}, number = ${body.number}, language_id = ${languageId} WHERE id = ${body.id}`;

      return apiData();
    },

    DELETE: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const { id } = await req.json();

      // Get the team number before deleting
      const teamResults: { number: number }[] = await sql`SELECT number FROM teams WHERE id = ${id}`;
      const teamToDelete = teamResults[0];

      if (!teamToDelete) {
        return apiBadRequest('Team not found');
      }

      // Delete the team
      await sql`DELETE FROM teams WHERE id = ${id}`;

      // Renumber all teams with higher numbers to close the gap
      await sql`UPDATE teams SET number = number - 1 WHERE event_id = ${eventId} AND number > ${teamToDelete.number}`;

      return apiData();
    }
  }
};
