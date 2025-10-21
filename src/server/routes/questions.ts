import { db } from '@/server/db';
import type { Routes } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';
import {
  apiBadRequest,
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';

// Types for the YAML import
interface LanguageDefinition {
  code: string;
  name: string;
}

interface QuestionTranslation {
  lang: string;
  body: string;
  answer: string;
}

interface QuestionImport {
  type: 'PS' | 'PW' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  translations: QuestionTranslation[];
}

interface QuestionsFileFormat {
  languages: LanguageDefinition[];
  questions: QuestionImport[];
}

interface Language {
  code: string;
  name: string;
  eventId: string;
}

// Database queries
const queryCheckPermission = db.query<{ roleId: string }, { $userId: string; $eventId: string }>(
  `SELECT roleId FROM permissions
   WHERE userId = $userId AND eventId = $eventId AND roleId IN ('owner', 'admin')`
);

const queryGetLanguages = db.query<Language, { $eventId: string }>(
  `SELECT code, name, eventId FROM languages WHERE eventId = $eventId`
);

const queryInsertQuestion = db.query<
  {},
  { $id: string; $type: string; $maxPoints: number; $seconds: number; $eventId: string }
>(
  `INSERT INTO questions (id, type, maxPoints, seconds, eventId)
   VALUES ($id, $type, $maxPoints, $seconds, $eventId)`
);

const queryInsertQuestionTranslation = db.query<
  {},
  { $id: string; $body: string; $answer: string; $languageCode: string; $questionId: string }
>(
  `INSERT INTO questionTranslations (id, body, answer, languageCode, questionId)
   VALUES ($id, $body, $answer, $languageCode, $questionId)`
);

const queryDeleteQuestions = db.query<{}, { $eventId: string }>(`DELETE FROM questions WHERE eventId = $eventId`);

const queryGetQuestions = db.query<
  { id: string; type: string; maxPoints: number; seconds: number },
  { $eventId: string }
>(
  `SELECT id, type, maxPoints, seconds FROM questions
   WHERE eventId = $eventId
   ORDER BY createdAt ASC`
);

const queryGetQuestionTranslations = db.query<{ languageCode: string; body: string; answer: string }, { $questionId: string }>(
  `SELECT languageCode, body, answer FROM questionTranslations
   WHERE questionId = $questionId
   ORDER BY languageCode ASC`
);

const queryGetEventName = db.query<{ name: string }, { $eventId: string; $userId: string }>(
  `SELECT events.name FROM events
   JOIN permissions ON events.id = permissions.eventId
   WHERE events.id = $eventId AND permissions.userId = $userId`
);

const queryDeleteLanguages = db.query<{}, { $eventId: string }>(`DELETE FROM languages WHERE eventId = $eventId`);

const queryInsertLanguage = db.query<{}, { $code: string; $name: string; $eventId: string }>(
  `INSERT INTO languages (code, name, eventId) VALUES ($code, $name, $eventId)`
);

// Individual question CRUD queries
const queryGetQuestion = db.query<
  { id: string; type: string; maxPoints: number; seconds: number; eventId: string },
  { $questionId: string }
>(
  `SELECT id, type, maxPoints, seconds, eventId FROM questions WHERE id = $questionId`
);

const queryUpdateQuestion = db.query<
  {},
  { $id: string; $type: string; $maxPoints: number; $seconds: number }
>(
  `UPDATE questions SET type = $type, maxPoints = $maxPoints, seconds = $seconds WHERE id = $id`
);

const queryDeleteQuestion = db.query<{}, { $id: string }>(
  `DELETE FROM questions WHERE id = $id`
);

// Individual question translation CRUD queries
const queryGetSingleQuestionTranslation = db.query<
  { id: string; body: string; answer: string; languageCode: string; questionId: string },
  { $id: string }
>(
  `SELECT id, body, answer, languageCode, questionId FROM questionTranslations WHERE id = $id`
);

const queryUpdateQuestionTranslation = db.query<
  {},
  { $id: string; $body: string; $answer: string }
>(
  `UPDATE questionTranslations SET body = $body, answer = $answer WHERE id = $id`
);

const queryDeleteQuestionTranslation = db.query<{}, { $id: string }>(
  `DELETE FROM questionTranslations WHERE id = $id`
);

/**
 * Validates the YAML structure and data
 */
function validateQuestionsData(data: unknown): {
  valid: boolean;
  error?: string;
  languages?: LanguageDefinition[];
  questions?: QuestionImport[];
} {
  // Check if data is an object with languages and questions
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'YAML file must contain an object with languages and questions' };
  }

  const fileData = data as any;

  // Validate languages array
  if (!Array.isArray(fileData.languages)) {
    return { valid: false, error: 'YAML file must contain a languages array' };
  }

  if (fileData.languages.length === 0) {
    return { valid: false, error: 'At least one language must be defined' };
  }

  const languages: LanguageDefinition[] = [];
  const validLanguageCodes = new Set<string>();

  // Validate each language
  for (let i = 0; i < fileData.languages.length; i++) {
    const lang = fileData.languages[i];

    if (typeof lang !== 'object' || lang === null) {
      return { valid: false, error: `Language ${i + 1}: Must be an object` };
    }

    // Validate code
    if (typeof lang.code !== 'string' || lang.code.trim() === '') {
      return { valid: false, error: `Language ${i + 1}: code must be a non-empty string` };
    }

    // Validate name
    if (typeof lang.name !== 'string' || lang.name.trim() === '') {
      return { valid: false, error: `Language ${i + 1}: name must be a non-empty string` };
    }

    const code = lang.code.trim();

    // Check for duplicate language codes
    if (validLanguageCodes.has(code)) {
      return { valid: false, error: `Language ${i + 1}: Duplicate language code "${code}"` };
    }

    validLanguageCodes.add(code);
    languages.push({ code, name: lang.name.trim() });
  }

  // Check if questions is an array
  if (!Array.isArray(fileData.questions)) {
    return { valid: false, error: 'YAML file must contain a questions array' };
  }

  const questions: QuestionImport[] = [];
  const validTypes = new Set(['PS', 'PW', 'TF', 'FB']);

  for (let i = 0; i < fileData.questions.length; i++) {
    const q = fileData.questions[i];

    // Validate question structure
    if (typeof q !== 'object' || q === null) {
      return { valid: false, error: `Question ${i + 1}: Must be an object` };
    }

    // Validate type
    if (!validTypes.has(q.type)) {
      return {
        valid: false,
        error: `Question ${i + 1}: Invalid type "${q.type}". Must be PS, PW, TF, or FB`
      };
    }

    // Validate maxPoints
    if (typeof q.maxPoints !== 'number' || q.maxPoints <= 0) {
      return {
        valid: false,
        error: `Question ${i + 1}: maxPoints must be a positive number`
      };
    }

    // Validate seconds
    if (typeof q.seconds !== 'number' || q.seconds <= 0) {
      return {
        valid: false,
        error: `Question ${i + 1}: seconds must be a positive number`
      };
    }

    // Validate info array
    if (!Array.isArray(q.translations) || q.translations.length === 0) {
      return {
        valid: false,
        error: `Question ${i + 1}: Must have at least one translation entry`
      };
    }

    // Track which languages have translations for this question
    const questionLanguages = new Set<string>();

    // Validate each translation entry
    for (let j = 0; j < q.translations.length; j++) {
      const translation = q.translations[j];

      if (typeof translation !== 'object' || translation === null) {
        return {
          valid: false,
          error: `Question ${i + 1}, Translation ${j + 1}: Must be an object`
        };
      }

      // Validate language code
      if (typeof translation.lang !== 'string' || !validLanguageCodes.has(translation.lang)) {
        return {
          valid: false,
          error: `Question ${i + 1}, Translation ${j + 1}: Invalid or unknown language code "${translation.lang}"`
        };
      }

      // Check for duplicate language in this question
      if (questionLanguages.has(translation.lang)) {
        return {
          valid: false,
          error: `Question ${i + 1}: Duplicate translation for language "${translation.lang}"`
        };
      }

      questionLanguages.add(translation.lang);

      // Validate body
      if (typeof translation.body !== 'string' || translation.body.trim() === '') {
        return {
          valid: false,
          error: `Question ${i + 1}, Translation ${j + 1}: body must be a non-empty string`
        };
      }

      // Validate answer
      if (typeof translation.answer !== 'string' || translation.answer.trim() === '') {
        return {
          valid: false,
          error: `Question ${i + 1}, Translation ${j + 1}: answer must be a non-empty string`
        };
      }

      // For TF questions, validate answer is "true" or "false"
      if (q.type === 'TF') {
        const normalizedAnswer = translation.answer.toLowerCase().trim();

        if (normalizedAnswer !== 'true' && normalizedAnswer !== 'false') {
          return {
            valid: false,
            error: `Question ${i + 1}, Translation ${j + 1}: True/False answer must be "true" or "false"`
          };
        }
      }
    }

    // Validate that all languages are present in this question
    const missingLanguages = Array.from(validLanguageCodes).filter(
      (code) => !questionLanguages.has(code)
    );

    if (missingLanguages.length > 0) {
      return {
        valid: false,
        error: `Question ${i + 1}: Missing translations for language(s): ${missingLanguages.join(', ')}`
      };
    }

    questions.push(q as QuestionImport);
  }

  return { valid: true, languages, questions };
}

/**
 * Converts an event name to a safe filename format
 */
function toSafeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .slice(0, 50); // Limit length to 50 characters
}

/**
 * Imports questions from validated data into the database
 */
function importQuestions(questions: QuestionImport[], eventId: string): number {
  let imported = 0;

  for (const question of questions) {
    const questionId = Bun.randomUUIDv7();

    // Insert question
    queryInsertQuestion.run({
      $id: questionId,
      $type: question.type,
      $maxPoints: question.maxPoints,
      $seconds: question.seconds,
      $eventId: eventId
    });

    // Insert question translation for each language
    for (const translation of question.translations) {
      const translationId = Bun.randomUUIDv7();

      queryInsertQuestionTranslation.run({
        $id: translationId,
        $body: translation.body.trim(),
        $answer: translation.answer.trim(),
        $languageCode: translation.lang,
        $questionId: questionId
      });
    }

    imported++;
  }

  return imported;
}

export const questionsRoutes: Routes = {
  '/api/events/:eventId/questions/import': {
    POST: async (req: BunRequest<'/api/events/:eventId/questions/import'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      // Parse multipart form data
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return apiBadRequest('No file provided');
      }

      // Check file type
      if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml')) {
        return apiBadRequest('File must be a YAML file (.yaml or .yml)');
      }

      // Read file content
      const fileContent = await file.text();

      // Parse YAML
      let yamlData: unknown;

      try {
        yamlData = Bun.YAML.parse(fileContent);
      } catch (error) {
        return apiBadRequest(`Invalid YAML format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate the data
      const validation = validateQuestionsData(yamlData);

      if (!validation.valid) {
        return apiBadRequest(validation.error || 'Invalid data');
      }

      // Import questions and languages in a transaction
      try {
        db.transaction(() => {
          // Delete existing languages (this will cascade to questionTranslations and then questions due to foreign keys)
          queryDeleteLanguages.run({ $eventId: eventId });

          // Delete existing questions (in case cascade didn't catch everything)
          queryDeleteQuestions.run({ $eventId: eventId });

          // Insert new languages
          for (const lang of validation.languages!) {
            queryInsertLanguage.run({
              $code: lang.code,
              $name: lang.name,
              $eventId: eventId
            });
          }

          // Import new questions
          importQuestions(validation.questions!, eventId);
        })();

        return apiData({
          message: 'Questions and languages imported successfully',
          languageCount: validation.languages!.length,
          questionCount: validation.questions!.length
        });
      } catch (error) {
        console.error('Error importing questions:', error);
        return apiServerError('Failed to import questions');
      }
    }
  },
  '/api/events/:eventId/questions/export': {
    GET: (req: BunRequest<'/api/events/:eventId/questions/export'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions - allow any user with access to the event
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      // Get event name for filename
      const event = queryGetEventName.get({
        $eventId: eventId,
        $userId: session.userId
      });

      if (!event) {
        return apiNotFound('Event not found');
      }

      // Get all languages for this event
      const languages = queryGetLanguages.all({ $eventId: eventId });

      // Get all questions for this event
      const questions = queryGetQuestions.all({ $eventId: eventId });

      // Check if there's anything to export
      if (languages.length === 0 || questions.length === 0) {
        return apiBadRequest('Nothing to export - event has no languages or questions configured');
      }

      // Build the languages array
      const languagesExport: LanguageDefinition[] = languages.map((l) => ({
        code: l.code,
        name: l.name
      }));

      // Build the questions export data structure
      const questionsExport: QuestionImport[] = [];

      for (const question of questions) {
        const questionTranslations = queryGetQuestionTranslations.all({ $questionId: question.id });

        const translations: QuestionTranslation[] = questionTranslations.map((qt) => ({
          lang: qt.languageCode,
          body: qt.body,
          answer: qt.answer
        }));

        questionsExport.push({
          type: question.type as 'PS' | 'PW' | 'TF' | 'FB',
          maxPoints: question.maxPoints,
          seconds: question.seconds,
          translations
        });
      }

      // Build complete export structure
      const exportData: QuestionsFileFormat = {
        languages: languagesExport,
        questions: questionsExport
      };

      // Convert to YAML
      let yamlContent: string;

      try {
        yamlContent = Bun.YAML.stringify(exportData);
      } catch (error) {
        console.error('Error converting to YAML:', error);
        return apiServerError('Failed to generate YAML file');
      }

      // Generate safe filename from event name
      const safeEventName = toSafeFilename(event.name);
      const filename = `questions-${safeEventName}.yaml`;

      // Return as downloadable file
      return new Response(yamlContent, {
        headers: {
          'Content-Type': 'application/x-yaml',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }
  },

  // Add a new question (without info)
  '/api/events/:eventId/questions': {
    POST: async (req: BunRequest<'/api/events/:eventId/questions'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();
      const { type, maxPoints, seconds } = body;

      // Validate required fields
      if (!type || typeof maxPoints !== 'number' || typeof seconds !== 'number') {
        return apiBadRequest('Missing or invalid fields: type, maxPoints, and seconds are required');
      }

      // Validate type
      const validTypes = new Set(['PS', 'PW', 'TF', 'FB']);
      if (!validTypes.has(type)) {
        return apiBadRequest('Invalid type. Must be PS, PW, TF, or FB');
      }

      // Validate numeric values
      if (maxPoints <= 0 || seconds <= 0) {
        return apiBadRequest('maxPoints and seconds must be positive numbers');
      }

      try {
        const questionId = Bun.randomUUIDv7();

        queryInsertQuestion.run({
          $id: questionId,
          $type: type,
          $maxPoints: maxPoints,
          $seconds: seconds,
          $eventId: eventId
        });

        return apiData({ id: questionId, type, maxPoints, seconds });
      } catch (error) {
        console.error('Error creating question:', error);
        return apiServerError('Failed to create question');
      }
    }
  },

  // Update a question
  '/api/questions/:questionId': {
    PATCH: async (req: BunRequest<'/api/questions/:questionId'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const questionId = req.params.questionId;

      // Get the question to verify it exists and get eventId
      const question = queryGetQuestion.get({ $questionId: questionId });

      if (!question) {
        return apiNotFound('Question not found');
      }

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: question.eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();
      const { type, maxPoints, seconds } = body;

      // Validate fields if provided
      if (type !== undefined) {
        const validTypes = new Set(['PS', 'PW', 'TF', 'FB']);
        if (!validTypes.has(type)) {
          return apiBadRequest('Invalid type. Must be PS, PW, TF, or FB');
        }
      }

      if (maxPoints !== undefined && (typeof maxPoints !== 'number' || maxPoints <= 0)) {
        return apiBadRequest('maxPoints must be a positive number');
      }

      if (seconds !== undefined && (typeof seconds !== 'number' || seconds <= 0)) {
        return apiBadRequest('seconds must be a positive number');
      }

      try {
        queryUpdateQuestion.run({
          $id: questionId,
          $type: type ?? question.type,
          $maxPoints: maxPoints ?? question.maxPoints,
          $seconds: seconds ?? question.seconds
        });

        return apiData({ ok: true });
      } catch (error) {
        console.error('Error updating question:', error);
        return apiServerError('Failed to update question');
      }
    },

    // Delete a question
    DELETE: (req: BunRequest<'/api/questions/:questionId'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const questionId = req.params.questionId;

      // Get the question to verify it exists and get eventId
      const question = queryGetQuestion.get({ $questionId: questionId });

      if (!question) {
        return apiNotFound('Question not found');
      }

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: question.eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      try {
        queryDeleteQuestion.run({ $id: questionId });
        return apiData({ ok: true });
      } catch (error) {
        console.error('Error deleting question:', error);
        return apiServerError('Failed to delete question');
      }
    }
  },

  // Add question translation
  '/api/questions/:questionId/translations': {
    POST: async (req: BunRequest<'/api/questions/:questionId/translations'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const questionId = req.params.questionId;

      // Get the question to verify it exists and get eventId
      const question = queryGetQuestion.get({ $questionId: questionId });

      if (!question) {
        return apiNotFound('Question not found');
      }

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: question.eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();
      const { languageCode, questionBody, answer } = body;

      // Validate required fields
      if (!languageCode || !questionBody || !answer) {
        return apiBadRequest('Missing required fields: languageCode, questionBody, and answer');
      }

      // Validate that the language exists for this event
      const languages = queryGetLanguages.all({ $eventId: question.eventId });
      const validLanguages = new Set(languages.map((l) => l.code));

      if (!validLanguages.has(languageCode)) {
        return apiBadRequest(`Invalid language code "${languageCode}" for this event`);
      }

      // For TF questions, validate answer is "true" or "false"
      if (question.type === 'TF') {
        const normalizedAnswer = answer.toLowerCase().trim();
        if (normalizedAnswer !== 'true' && normalizedAnswer !== 'false') {
          return apiBadRequest('True/False answer must be "true" or "false"');
        }
      }

      try {
        const translationId = Bun.randomUUIDv7();

        queryInsertQuestionTranslation.run({
          $id: translationId,
          $body: questionBody.trim(),
          $answer: answer.trim(),
          $languageCode: languageCode,
          $questionId: questionId
        });

        return apiData({ id: translationId, languageCode, body: questionBody.trim(), answer: answer.trim() });
      } catch (error) {
        console.error('Error creating question translation:', error);
        return apiServerError('Failed to create question translation');
      }
    }
  },

  // Update question translation
  '/api/questions/translations/:translationId': {
    PATCH: async (req: BunRequest<'/api/questions/translations/:translationId'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const translationId = req.params.translationId;

      // Get the question translation to verify it exists
      const questionTranslation = queryGetSingleQuestionTranslation.get({ $id: translationId });

      if (!questionTranslation) {
        return apiNotFound('Question translation not found');
      }

      // Get the parent question to check permissions
      const question = queryGetQuestion.get({ $questionId: questionTranslation.questionId });

      if (!question) {
        return apiNotFound('Parent question not found');
      }

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: question.eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();
      const { questionBody, answer } = body;

      // Validate fields if provided
      if (questionBody !== undefined && typeof questionBody !== 'string') {
        return apiBadRequest('questionBody must be a string');
      }

      if (answer !== undefined && typeof answer !== 'string') {
        return apiBadRequest('answer must be a string');
      }

      // For TF questions, validate answer is "true" or "false"
      if (answer !== undefined && question.type === 'TF') {
        const normalizedAnswer = answer.toLowerCase().trim();
        if (normalizedAnswer !== 'true' && normalizedAnswer !== 'false') {
          return apiBadRequest('True/False answer must be "true" or "false"');
        }
      }

      try {
        queryUpdateQuestionTranslation.run({
          $id: translationId,
          $body: questionBody !== undefined ? questionBody.trim() : questionTranslation.body,
          $answer: answer !== undefined ? answer.trim() : questionTranslation.answer
        });

        return apiData({ ok: true });
      } catch (error) {
        console.error('Error updating question translation:', error);
        return apiServerError('Failed to update question translation');
      }
    },

    // Delete question translation
    DELETE: (req: BunRequest<'/api/questions/translations/:translationId'>) => {
      const session = getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const translationId = req.params.translationId;

      // Get the question translation to verify it exists
      const questionTranslation = queryGetSingleQuestionTranslation.get({ $id: translationId });

      if (!questionTranslation) {
        return apiNotFound('Question translation not found');
      }

      // Get the parent question to check permissions
      const question = queryGetQuestion.get({ $questionId: questionTranslation.questionId });

      if (!question) {
        return apiNotFound('Parent question not found');
      }

      // Check permissions
      const permission = queryCheckPermission.get({
        $userId: session.userId,
        $eventId: question.eventId
      });

      if (!permission) {
        return apiForbidden();
      }

      try {
        queryDeleteQuestionTranslation.run({ $id: translationId });
        return apiData({ ok: true });
      } catch (error) {
        console.error('Error deleting question translation:', error);
        return apiServerError('Failed to delete question translation');
      }
    }
  }
};
