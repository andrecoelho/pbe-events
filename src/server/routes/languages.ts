import { sql } from 'bun';
import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiData, apiForbidden, apiUnauthorized, apiBadRequest } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

interface Language {
  id: string;
  code: string;
  name: string;
  event_id: string;
  created_at: number;
}

export const languagesRoutes: Routes = {
  '/api/events/:id/languages': {
    GET: async (req: BunRequest<'/api/events/:id/languages'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const languages: Language[] = await sql`
        SELECT id, code, name, event_id, created_at
        FROM languages
        WHERE event_id = ${eventId}
        ORDER BY code
      `;

      return apiData({ eventName: event.name, languages });
    },

    POST: async (req: BunRequest<'/api/events/:id/languages'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const body = (await req.json()) as { code: string; name: string };
      const code = body.code.trim();
      const name = body.name.trim();

      if (!code) {
        return apiBadRequest('Language code is required');
      }

      if (!name) {
        return apiBadRequest('Language name is required');
      }

      const existingLanguages: { id: string }[] = await sql`
        SELECT id FROM languages WHERE event_id = ${eventId} AND code = ${code}
      `;

      if (existingLanguages.length > 0) {
        return apiBadRequest('A language with this code already exists');
      }

      const id = Bun.randomUUIDv7();

      await sql`INSERT INTO languages (id, event_id, code, name) VALUES (${id}, ${eventId}, ${code}, ${name})`;

      return apiData({ id });
    },

    PATCH: async (req: BunRequest<'/api/events/:id/languages'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = await querySelectEvent(eventId, session.user_id);

      if (!event) {
        return apiForbidden();
      }

      const body = (await req.json()) as { id: string; code: string; name: string };
      const code = body.code.trim();
      const name = body.name.trim();

      if (!code) {
        return apiBadRequest('Language code is required');
      }

      if (!name) {
        return apiBadRequest('Language name is required');
      }

      const existingLanguages: { id: string }[] = await sql`
        SELECT id FROM languages WHERE event_id = ${eventId} AND code = ${code}
      `;

      if (existingLanguages.length > 0 && existingLanguages[0]!.id !== body.id) {
        return apiBadRequest('A language with this code already exists');
      }

      await sql`UPDATE languages SET code = ${code}, name = ${name} WHERE id = ${body.id}`;

      return apiData();
    },

    DELETE: async (req: BunRequest<'/api/events/:id/languages'>) => {
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

      await sql`DELETE FROM languages WHERE id = ${id}`;

      return apiData();
    }
  }
};
