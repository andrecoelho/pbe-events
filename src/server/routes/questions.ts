import { eventRole, json, type EventRoleAdds } from '@/server/http/middleware';
import { badRequest, middleware, notFound, route } from '@/server/http/route';
import { toSafeFilename, validateQuestionsData, type QuestionsFileFormat } from '@/server/questionsFile';
import { listLanguages } from '@/server/services/languages';
import { MANAGER_ROLES } from '@/server/services/permissions';
import {
  addTranslation,
  createQuestion,
  deleteQuestion,
  deleteTranslation,
  getQuestion,
  getQuestionsForExport,
  getTranslationWithQuestion,
  listQuestionsForEditor,
  replaceQuestions,
  updateQuestion,
  updateTranslation,
  type Question
} from '@/server/services/questions';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const TYPES = ['PG', 'PS', 'TF', 'FB'] as const;
const invalidType = 'Invalid type. Must be PG, PS, TF, or FB';
const missingFields = 'Missing or invalid fields: type, maxPoints, and seconds are required';
const positive = (message: string) => z.number({ error: message }).positive(message);

const NewQuestion = z.object({
  type: z.string({ error: missingFields }).pipe(z.enum(TYPES, { error: invalidType })),
  maxPoints: z.number({ error: missingFields }).positive('maxPoints and seconds must be positive numbers'),
  seconds: z.number({ error: missingFields }).positive('maxPoints and seconds must be positive numbers'),
  insertBefore: positive('insertBefore must be a positive number').optional()
});
const QuestionChange = z.object({
  number: positive('number must be a positive number').optional(),
  type: z.enum(TYPES, { error: invalidType }).optional(),
  maxPoints: positive('maxPoints must be a positive number').optional(),
  seconds: positive('seconds must be a positive number').optional()
});
const missingTranslation = 'Missing required fields: languageCode, prompt, and answer';
const NewTranslation = z.object({
  languageCode: z.string({ error: missingTranslation }),
  prompt: z.string({ error: missingTranslation }).trim(),
  answer: z.string({ error: missingTranslation }).trim(),
  // The questions page sends null for "no clarification".
  clarification: z.string().trim().nullish()
});
const TranslationChange = z.object({
  prompt: z.string({ error: 'prompt must be a string' }).trim().optional(),
  answer: z.string({ error: 'answer must be a string' }).trim().optional(),
  // null clears it; leaving it out keeps it.
  clarification: z.string().trim().nullish()
});

function checkTrueFalse(type: string, answer: string | undefined) {
  if (type === 'TF' && answer !== undefined) {
    const normalized = answer.toLowerCase().trim();

    if (normalized !== 'true' && normalized !== 'false') {
      throw badRequest('True/False answer must be "true" or "false"');
    }
  }
}

const managers = () => eventRole(...MANAGER_ROLES);

// Loads the question in :questionId (404 if missing), then checks the user manages its event.
const questionManagers = () =>
  middleware<EventRoleAdds & { question: Question }>(async (ctx, next) => {
    const question = await getQuestion(ctx.params.questionId ?? '');

    if (!question) {
      throw notFound('Question not found');
    }

    Object.assign(ctx, { question });

    return eventRole(...MANAGER_ROLES, { eventId: () => question.event_id })(ctx, next);
  });

// The same for the translation in :translationId.
type TranslationWithQuestion = NonNullable<Awaited<ReturnType<typeof getTranslationWithQuestion>>>;

const translationManagers = () =>
  middleware<EventRoleAdds & { translation: TranslationWithQuestion }>(async (ctx, next) => {
    const translation = await getTranslationWithQuestion(ctx.params.translationId ?? '');

    if (!translation) {
      throw notFound('Question translation not found');
    }

    Object.assign(ctx, { translation });

    return eventRole(...MANAGER_ROLES, { eventId: () => translation.event_id })(ctx, next);
  });

export const questionsRoutes: Routes = {
  '/api/events/:eventId/questions': {
    GET: route(managers(), async ({ event }) => {
      const [languages, questions] = await Promise.all([listLanguages(event.id), listQuestionsForEditor(event.id)]);

      return {
        eventName: event.name,
        languages: Object.fromEntries(languages.map((language) => [language.code, language.name])),
        questions
      };
    }),

    POST: route(managers(), json(NewQuestion), async ({ event, body }) => ({
      question: await createQuestion(event.id, body)
    }))
  },

  // Replaces the event's questions with a YAML file's (multipart form: `file`, and optionally
  // `teamLanguage` and `deleteAnswers` to resolve a 409; see docs/QUESTIONS_IMPORT_API.md).
  '/api/events/:eventId/questions/import': {
    POST: route(managers(), async ({ event, req }) => {
      const form = await req.formData();
      const file = form.get('file');
      const teamLanguage = form.get('teamLanguage');
      const deleteAnswers = form.get('deleteAnswers');

      if (!file || !(file instanceof File)) {
        throw badRequest('Choose a questions file to import.');
      }

      if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml')) {
        throw badRequest('Choose a questions file ending in .yaml or .yml.');
      }

      let data: unknown;

      try {
        data = Bun.YAML.parse(await file.text());
      } catch (error) {
        throw badRequest(
          `The file isn’t valid YAML (${error instanceof Error ? error.message : 'unreadable'}). Check that line, or start from the exported or example file.`
        );
      }

      const validation = validateQuestionsData(data);

      if (!validation.valid) {
        throw badRequest(validation.error || 'The questions file has a problem.');
      }

      await replaceQuestions(event.id, validation.languages!, validation.questions!, {
        teamLanguage: typeof teamLanguage === 'string' && teamLanguage !== '' ? teamLanguage : undefined,
        deleteAnswers: deleteAnswers === 'true'
      });

      return {
        message: 'Questions and languages imported successfully',
        languageCount: validation.languages!.length,
        questionCount: validation.questions!.length
      };
    })
  },

  '/api/events/:eventId/questions/export': {
    GET: route(managers(), async ({ event }) => {
      const exportData: QuestionsFileFormat = await getQuestionsForExport(event.id);

      if (exportData.languages.length === 0 || exportData.questions.length === 0) {
        throw badRequest('There’s nothing to export yet: add languages and questions first.');
      }

      return new Response(Bun.YAML.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/x-yaml',
          'Content-Disposition': `attachment; filename="questions-${toSafeFilename(event.name)}.yaml"`
        }
      });
    })
  },

  '/api/questions/:questionId': {
    PATCH: route(questionManagers(), json(QuestionChange), async ({ question, body }) => {
      await updateQuestion(question, body);
      return {};
    }),

    DELETE: route(questionManagers(), async ({ question }) => {
      await deleteQuestion(question);
      return {};
    })
  },

  '/api/questions/:questionId/translations': {
    POST: route(questionManagers(), json(NewTranslation), async ({ question, body }) => {
      const language = (await listLanguages(question.event_id)).find((l) => l.code === body.languageCode);

      if (!language) {
        throw badRequest(`Invalid language code "${body.languageCode}" for this event`);
      }

      checkTrueFalse(question.type, body.answer);

      const id = await addTranslation({ questionId: question.id, languageId: language.id, ...body });

      return { translation: { id, ...body } };
    })
  },

  '/api/questions/translations/:translationId': {
    PATCH: route(translationManagers(), json(TranslationChange), async ({ translation, body }) => {
      checkTrueFalse(translation.type, body.answer);

      await updateTranslation({
        ...translation,
        prompt: body.prompt ?? translation.prompt,
        answer: body.answer ?? translation.answer,
        clarification: body.clarification === undefined ? translation.clarification : body.clarification
      });

      return {};
    }),

    DELETE: route(translationManagers(), async ({ translation }) => {
      await deleteTranslation(translation.id);
      return {};
    })
  }
};
