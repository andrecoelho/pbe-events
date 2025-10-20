import { db } from '@/server/db';
import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Team, Routes } from '@/server/types';
import { apiData, apiForbidden, apiUnauthorized, apiBadRequest } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

const querySelectTeamsByEventId = db.query<Team, { $eventId: string }>(
  `SELECT id, name, number, eventId, createdAt FROM teams WHERE eventId = $eventId`
);

const querySelectTeamByName = db.query<{ id: string }, { $eventId: string; $name: string }>(
  `SELECT id FROM teams WHERE eventId = $eventId AND name = $name`
);

const queryInsertTeam = db.query<{ id: string }, { $id: string; $eventId: string; $name: string; $number: number }>(
  `INSERT INTO teams (id, eventId, name, number) VALUES ($id, $eventId, $name, $number)`
);

const queryUpdateTeam = db.query<Team, { $id: string; $name: string; $number: number }>(
  `UPDATE teams SET name = $name, number = $number WHERE id = $id`
);

const queryDeleteTeam = db.query<{ id: string }, { $id: string }>(`DELETE FROM teams WHERE id = $id`);

const querySelectTeamNumber = db.query<{ number: number }, { $id: string }>(
  `SELECT number FROM teams WHERE id = $id`
);

const queryUpdateTeamNumbers = db.query<Team, { $eventId: string; $number: number }>(
  `UPDATE teams SET number = number - 1 WHERE eventId = $eventId AND number > $number`
);

export const teamsRoutes: Routes = {
  '/api/events/:id/teams': {
    GET: (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const teams = querySelectTeamsByEventId.all({ $eventId: eventId });

      return apiData({ eventName: event.name, teams });
    },

    POST: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const body = (await req.json()) as { name: string };
      const name = body.name.trim();

      if (!name) {
        return apiBadRequest('Team name is required');
      }

      const existingTeam = querySelectTeamByName.get({ $eventId: eventId, $name: name });

      if (existingTeam) {
        return apiBadRequest('A team with this name already exists');
      }

      const teams = querySelectTeamsByEventId.all({ $eventId: eventId });

      const teamNumber = teams.length > 0
        ? Math.max(...teams.map(t => t.number)) + 1
        : 1;

      const id = Bun.randomUUIDv7();

      queryInsertTeam.run({ $id: id, $eventId: eventId, $name: name, $number: teamNumber });

      return apiData({ id, number: teamNumber });
    },

    PATCH: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const body = (await req.json()) as { id: string; name: string; number: number };
      const name = body.name.trim();

      if (!name) {
        return apiBadRequest('Team name is required');
      }

      const existingTeam = querySelectTeamByName.get({ $eventId: eventId, $name: name });

      if (existingTeam && existingTeam.id !== body.id) {
        return apiBadRequest('A team with this name already exists');
      }

      queryUpdateTeam.run({ $id: body.id, $name: name, $number: body.number });

      return apiData();
    },

    DELETE: async (req: BunRequest<'/api/events/:id/teams'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const { id } = await req.json();

      // Get the team number before deleting
      const teamToDelete = querySelectTeamNumber.get({ $id: id });

      if (!teamToDelete) {
        return apiBadRequest('Team not found');
      }

      // Delete the team
      queryDeleteTeam.run({ $id: id });

      // Renumber all teams with higher numbers to close the gap
      queryUpdateTeamNumbers.run({ $eventId: eventId, $number: teamToDelete.number });

      return apiData();
    }
  }
};
