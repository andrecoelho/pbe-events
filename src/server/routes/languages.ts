import { db } from '@/server/db';
import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiData, apiForbidden, apiUnauthorized, apiBadRequest } from '@/server/utils/responses';
import type { BunRequest } from 'bun';

interface Language {
  id: string;
  code: string;
  name: string;
  eventId: string;
  createdAt: number;
}

const querySelectLanguagesByEventId = db.query<Language, { $eventId: string }>(
  `SELECT id, code, name, eventId, createdAt FROM languages WHERE eventId = $eventId ORDER BY code`
);

const querySelectLanguageByCode = db.query<{ id: string }, { $eventId: string; $code: string }>(
  `SELECT id FROM languages WHERE eventId = $eventId AND code = $code`
);

const queryInsertLanguage = db.query<{ id: string }, { $id: string; $eventId: string; $code: string; $name: string }>(
  `INSERT INTO languages (id, eventId, code, name) VALUES ($id, $eventId, $code, $name)`
);

const queryUpdateLanguage = db.query<Language, { $id: string; $code: string; $name: string }>(
  `UPDATE languages SET code = $code, name = $name WHERE id = $id`
);

const queryDeleteLanguage = db.query<{ id: string }, { $id: string }>(`DELETE FROM languages WHERE id = $id`);

export const languagesRoutes: Routes = {
  '/api/events/:id/languages': {
    GET: (req: BunRequest<'/api/events/:id/languages'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

      if (!event) {
        return apiForbidden();
      }

      const languages = querySelectLanguagesByEventId.all({ $eventId: eventId });

      return apiData({ eventName: event.name, languages });
    },

    POST: async (req: BunRequest<'/api/events/:id/languages'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

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

      const existingLanguage = querySelectLanguageByCode.get({ $eventId: eventId, $code: code });

      if (existingLanguage) {
        return apiBadRequest('A language with this code already exists');
      }

      const id = Bun.randomUUIDv7();

      queryInsertLanguage.run({ $id: id, $eventId: eventId, $code: code, $name: name });

      return apiData({ id });
    },

    PATCH: async (req: BunRequest<'/api/events/:id/languages'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;
      const event = querySelectEvent.get({ $eventId: eventId, $userId: session.userId });

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

      const existingLanguage = querySelectLanguageByCode.get({ $eventId: eventId, $code: code });

      if (existingLanguage && existingLanguage.id !== body.id) {
        return apiBadRequest('A language with this code already exists');
      }

      queryUpdateLanguage.run({ $id: body.id, $code: code, $name: name });

      return apiData();
    },

    DELETE: async (req: BunRequest<'/api/events/:id/languages'>) => {
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

      queryDeleteLanguage.run({ $id: id });

      return apiData();
    }
  }
};
