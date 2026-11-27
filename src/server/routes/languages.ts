import { eventRole, json } from '@/server/http/middleware';
import { badRequest, route } from '@/server/http/route';
import {
  addLanguage,
  deleteLanguage,
  findLanguageByCode,
  listLanguagesWithDates,
  updateLanguage
} from '@/server/services/languages';
import { MANAGER_ROLES } from '@/server/services/permissions';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const NewLanguage = z.object({
  code: z.string({ error: 'Language code is required' }).trim().min(1, 'Language code is required'),
  name: z.string({ error: 'Language name is required' }).trim().min(1, 'Language name is required')
});
const LanguageChange = NewLanguage.extend({ id: z.string({ error: 'Language not found' }) });
const LanguageId = z.object({ id: z.string({ error: 'Language not found' }) });

const managers = () => eventRole(...MANAGER_ROLES);

export const languagesRoutes: Routes = {
  '/api/events/:id/languages': {
    GET: route(managers(), async ({ event }) => ({
      eventName: event.name,
      languages: await listLanguagesWithDates(event.id)
    })),

    POST: route(managers(), json(NewLanguage), async ({ event, body }) => {
      if (await findLanguageByCode(event.id, body.code)) {
        throw badRequest('A language with this code already exists');
      }

      return { id: await addLanguage(event.id, body.code, body.name) };
    }),

    PATCH: route(managers(), json(LanguageChange), async ({ event, body }) => {
      const sameCode = await findLanguageByCode(event.id, body.code);

      if (sameCode && sameCode !== body.id) {
        throw badRequest('A language with this code already exists');
      }

      if (!(await updateLanguage(event.id, body.id, body.code, body.name))) {
        throw badRequest('Language not found');
      }

      return {};
    }),

    DELETE: route(managers(), json(LanguageId), async ({ event, body }) => {
      await deleteLanguage(event.id, body.id);
      return {};
    })
  }
};
