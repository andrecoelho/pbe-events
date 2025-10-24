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
  prompt: string;
  answer: string | boolean; // boolean for TF questions, string for others
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
  { $id: string; $number: number; $type: string; $maxPoints: number; $seconds: number; $eventId: string }
>(
  `INSERT INTO questions (id, number, type, maxPoints, seconds, eventId)
   VALUES ($id, $number, $type, $maxPoints, $seconds, $eventId)`
);

const queryInsertQuestionTranslation = db.query<
  {},
  { $id: string; $prompt: string; $answer: string; $languageCode: string; $questionId: string }
>(
  `INSERT INTO questionTranslations (id, prompt, answer, languageCode, questionId)
   VALUES ($id, $prompt, $answer, $languageCode, $questionId)`
);

const queryDeleteQuestions = db.query<{}, { $eventId: string }>(`DELETE FROM questions WHERE eventId = $eventId`);

const queryGetQuestions = db.query<
  { id: string; number: number; type: string; maxPoints: number; seconds: number },
  { $eventId: string }
>(
  `SELECT id, number, type, maxPoints, seconds FROM questions
   WHERE eventId = $eventId
   ORDER BY number ASC`
);

const queryGetQuestionTranslations = db.query<
  { languageCode: string; prompt: string; answer: string },
  { $questionId: string }
>(
  `SELECT languageCode, prompt, answer FROM questionTranslations
   WHERE questionId = $questionId
   ORDER BY languageCode ASC`
);

const queryGetEventName = db.query<{ name: string }, { $eventId: string; $userId: string }>(
  `SELECT events.name FROM events
   JOIN permissions ON events.id = permissions.eventId
   WHERE events.id = $eventId AND permissions.userId = $userId`
);

// Optimized query to get all questions with translations in a single query
const queryGetQuestionsWithTranslations = db.query<
  {
    questionId: string;
    number: number;
    type: string;
    maxPoints: number;
    seconds: number;
    translationLanguageCode: string | null;
    translationPrompt: string | null;
    translationAnswer: string | null;
  },
  { $eventId: string }
>(
  `SELECT
    q.id as questionId,
    q.number,
    q.type,
    q.maxPoints,
    q.seconds,
    qt.languageCode as translationLanguageCode,
    qt.prompt as translationPrompt,
    qt.answer as translationAnswer
   FROM questions q
   LEFT JOIN questionTranslations qt ON q.id = qt.questionId
   WHERE q.eventId = $eventId
   ORDER BY q.number ASC, qt.languageCode ASC`
);

const queryDeleteLanguages = db.query<{}, { $eventId: string }>(`DELETE FROM languages WHERE eventId = $eventId`);

const queryInsertLanguage = db.query<{}, { $code: string; $name: string; $eventId: string }>(
  `INSERT INTO languages (code, name, eventId) VALUES ($code, $name, $eventId)`
);

// Individual question CRUD queries
const queryGetQuestion = db.query<
  { id: string; number: number; type: string; maxPoints: number; seconds: number; eventId: string },
  { $questionId: string }
>(`SELECT id, number, type, maxPoints, seconds, eventId FROM questions WHERE id = $questionId`);

const queryUpdateQuestion = db.query<
  {},
  { $id: string; $number: number; $type: string; $maxPoints: number; $seconds: number }
>(`UPDATE questions SET number = $number, type = $type, maxPoints = $maxPoints, seconds = $seconds WHERE id = $id`);

const queryDeleteQuestion = db.query<{}, { $id: string }>(`DELETE FROM questions WHERE id = $id`);

// Get the maximum question number for an event
const queryGetMaxQuestionNumber = db.query<{ maxNumber: number | null }, { $eventId: string }>(
  `SELECT MAX(number) as maxNumber FROM questions WHERE eventId = $eventId`
);

// Increment question numbers for reordering (shift questions up)
const queryIncrementQuestionNumbers = db.query<{}, { $eventId: string; $fromNumber: number }>(
  `UPDATE questions SET number = number + 1
   WHERE eventId = $eventId AND number >= $fromNumber`
);

// Decrement question numbers for reordering (shift questions down)
const queryDecrementQuestionNumbers = db.query<{}, { $eventId: string; $fromNumber: number }>(
  `UPDATE questions SET number = number - 1
   WHERE eventId = $eventId AND number > $fromNumber`
);

// Update just the question number
const queryUpdateQuestionNumber = db.query<{}, { $id: string; $number: number }>(
  `UPDATE questions SET number = $number WHERE id = $id`
);

// Individual question translation CRUD queries
const queryGetSingleQuestionTranslation = db.query<
  { id: string; prompt: string; answer: string; languageCode: string; questionId: string },
  { $id: string }
>(`SELECT id, prompt, answer, languageCode, questionId FROM questionTranslations WHERE id = $id`);

const queryUpdateQuestionTranslation = db.query<{}, { $id: string; $prompt: string; $answer: string }>(
  `UPDATE questionTranslations SET prompt = $prompt, answer = $answer WHERE id = $id`
);

const queryDeleteQuestionTranslation = db.query<{}, { $id: string }>(`DELETE FROM questionTranslations WHERE id = $id`);

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

    // Helper to get a prompt for error messages (use first translation if available)
    const getPromptHint = (): string => {
      if (Array.isArray(q.translations) && q.translations.length > 0) {
        const firstTranslation = q.translations[0];

        if (firstTranslation && typeof firstTranslation.prompt === 'string') {
          const prompt = firstTranslation.prompt.trim();
          const maxLength = 60;

          return prompt.length > maxLength ? ` ("${prompt.substring(0, maxLength)}...")` : ` ("${prompt}")`;
        }
      }

      return '';
    };

    // Validate type
    if (!validTypes.has(q.type)) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: Invalid type "${q.type}". Must be PS, PW, TF, or FB`
      };
    }

    // Validate maxPoints
    if (typeof q.maxPoints !== 'number' || q.maxPoints <= 0) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: maxPoints must be a positive number`
      };
    }

    // Validate seconds
    if (typeof q.seconds !== 'number' || q.seconds <= 0) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: seconds must be a positive number`
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
          error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: Must be an object`
        };
      }

      // Validate language code
      if (typeof translation.lang !== 'string' || !validLanguageCodes.has(translation.lang)) {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: Invalid or unknown language code "${
            translation.lang
          }"`
        };
      }

      // Check for duplicate language in this question
      if (questionLanguages.has(translation.lang)) {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}: Duplicate translation for language "${translation.lang}"`
        };
      }

      questionLanguages.add(translation.lang);

      // Validate prompt
      if (typeof translation.prompt !== 'string' || translation.prompt.trim() === '') {
        return {
          valid: false,
          error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: prompt must be a non-empty string`
        };
      }

      // Validate answer
      if (q.type === 'TF') {
        // For True/False questions, answer must be a boolean
        if (typeof translation.answer !== 'boolean') {
          return {
            valid: false,
            error: `Question ${i + 1}${getPromptHint()}, Translation ${
              j + 1
            }: True/False answer must be a boolean (true or false, not a string)`
          };
        }
      } else {
        // For other question types, answer must be a non-empty string
        if (typeof translation.answer !== 'string' || translation.answer.trim() === '') {
          return {
            valid: false,
            error: `Question ${i + 1}${getPromptHint()}, Translation ${j + 1}: answer must be a non-empty string`
          };
        }
      }
    }

    // Validate that all languages are present in this question
    const missingLanguages = Array.from(validLanguageCodes).filter((code) => !questionLanguages.has(code));

    if (missingLanguages.length > 0) {
      return {
        valid: false,
        error: `Question ${i + 1}${getPromptHint()}: Missing translations for language(s): ${missingLanguages.join(
          ', '
        )}`
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

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    if (!question) continue; // Safety check

    const questionId = Bun.randomUUIDv7();
    const questionNumber = i + 1; // Assign question number based on position (1-indexed)

    // Insert question
    queryInsertQuestion.run({
      $id: questionId,
      $number: questionNumber,
      $type: question.type,
      $maxPoints: question.maxPoints,
      $seconds: question.seconds,
      $eventId: eventId
    });

    // Insert question translation for each language
    for (const translation of question.translations) {
      const translationId = Bun.randomUUIDv7();

      // Convert boolean answers to string for storage
      const answerValue =
        typeof translation.answer === 'boolean' ? translation.answer.toString() : translation.answer.trim();

      queryInsertQuestionTranslation.run({
        $id: translationId,
        $prompt: translation.prompt.trim(),
        $answer: answerValue,
        $languageCode: translation.lang,
        $questionId: questionId
      });
    }

    imported++;
  }

  return imported;
}

export const questionsRoutes: Routes = {
  '/api/events/:eventId/questions': {
    // Get all questions for an event with event name
    GET: (req: BunRequest<'/api/events/:eventId/questions'>) => {
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

      // Get event name
      const event = queryGetEventName.get({
        $eventId: eventId,
        $userId: session.userId
      });

      if (!event) {
        return apiNotFound('Event not found');
      }

      // Get all questions with translations in a single query (optimized)
      const rows = queryGetQuestionsWithTranslations.all({ $eventId: eventId });

      // Group translations by question
      const questionsMap = new Map<
        string,
        {
          id: string;
          number: number;
          type: string;
          maxPoints: number;
          seconds: number;
          translations: Array<{ languageCode: string; prompt: string; answer: string }>;
        }
      >();

      for (const row of rows) {
        if (!questionsMap.has(row.questionId)) {
          questionsMap.set(row.questionId, {
            id: row.questionId,
            number: row.number,
            type: row.type,
            maxPoints: row.maxPoints,
            seconds: row.seconds,
            translations: []
          });
        }

        // Add translation if it exists (LEFT JOIN may return null for questions without translations)
        if (row.translationLanguageCode && row.translationPrompt && row.translationAnswer) {
          questionsMap.get(row.questionId)!.translations.push({
            languageCode: row.translationLanguageCode,
            prompt: row.translationPrompt,
            answer: row.translationAnswer
          });
        }
      }

      // Convert map to array (will maintain order since we inserted in ORDER BY order)
      const questionsWithTranslations = Array.from(questionsMap.values());

      // Get event languages
      const languages = queryGetLanguages.all({ $eventId: eventId });

      return apiData({
        eventName: event.name,
        languages: languages.map((l) => ({ code: l.code, name: l.name })),
        questions: questionsWithTranslations
      });
    },

    // Add a new question (without info)
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
      const { type, maxPoints, seconds, insertBefore } = body;

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

      // Validate insertBefore if provided
      if (insertBefore !== undefined && (typeof insertBefore !== 'number' || insertBefore <= 0)) {
        return apiBadRequest('insertBefore must be a positive number');
      }

      try {
        const questionId = Bun.randomUUIDv7();
        let questionNumber = 0;

        if (insertBefore !== undefined) {
          // Insert before specific question: increment all questions >= insertBefore
          db.transaction(() => {
            queryIncrementQuestionNumbers.run({
              $eventId: eventId,
              $fromNumber: insertBefore
            });

            questionNumber = insertBefore;

            queryInsertQuestion.run({
              $id: questionId,
              $number: questionNumber,
              $type: type,
              $maxPoints: maxPoints,
              $seconds: seconds,
              $eventId: eventId
            });
          })();
        } else {
          // Append to end: get the next available question number
          const maxNumberResult = queryGetMaxQuestionNumber.get({ $eventId: eventId });
          questionNumber = (maxNumberResult?.maxNumber ?? 0) + 1;

          queryInsertQuestion.run({
            $id: questionId,
            $number: questionNumber,
            $type: type,
            $maxPoints: maxPoints,
            $seconds: seconds,
            $eventId: eventId
          });
        }

        return apiData({ id: questionId, number: questionNumber, type, maxPoints, seconds });
      } catch (error) {
        console.error('Error creating question:', error);
        return apiServerError('Failed to create question');
      }
    }
  },
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
          prompt: qt.prompt,
          // Convert string "true"/"false" back to booleans for TF questions
          answer: question.type === 'TF' ? qt.answer === 'true' : qt.answer
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
        yamlContent = Bun.YAML.stringify(exportData, null, 2);
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
      const { number, type, maxPoints, seconds } = body as {
        number?: number;
        type?: 'PS' | 'PW' | 'TF' | 'FB';
        maxPoints?: number;
        seconds?: number;
      };

      // Validate fields if provided
      if (number !== undefined && (typeof number !== 'number' || number <= 0)) {
        return apiBadRequest('number must be a positive number');
      }

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
        // Handle reordering if number is being changed
        if (number !== undefined && number !== question.number) {
          const oldNumber = question.number;
          const newNumber = number; // TypeScript knows this is a number due to validation above

          // Use a transaction to handle the reordering atomically
          db.transaction(() => {
            // Step 1: Move current question to a temporary position (negative number)
            // This prevents conflicts with the UNIQUE constraint
            queryUpdateQuestionNumber.run({
              $id: questionId,
              $number: -1
            });

            if (newNumber < oldNumber) {
              // Moving question to an earlier position (e.g., from 5 to 2)
              // Increment all questions from newNumber to oldNumber-1
              // Questions 2,3,4 become 3,4,5
              db.query(
                `
                UPDATE questions
                SET number = number + 1
                WHERE eventId = ? AND number >= ? AND number < ?
              `
              ).run(question.eventId, newNumber, oldNumber);
            } else {
              // Moving question to a later position (e.g., from 2 to 5)
              // Decrement all questions from oldNumber+1 to newNumber
              // Questions 3,4,5 become 2,3,4
              db.query(
                `
                UPDATE questions
                SET number = number - 1
                WHERE eventId = ? AND number > ? AND number <= ?
              `
              ).run(question.eventId, oldNumber, newNumber);
            }

            // Step 2: Move current question to its new position
            queryUpdateQuestionNumber.run({
              $id: questionId,
              $number: newNumber
            });
          })();
        }

        // Update other fields (type, maxPoints, seconds)
        queryUpdateQuestion.run({
          $id: questionId,
          $number: number ?? question.number,
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
        // Use a transaction to delete the question and shift numbers down atomically
        db.transaction(() => {
          // Delete the question
          queryDeleteQuestion.run({ $id: questionId });

          // Shift all questions after this one down by decrementing their numbers
          queryDecrementQuestionNumbers.run({
            $eventId: question.eventId,
            $fromNumber: question.number
          });
        })();

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
          $prompt: questionBody.trim(),
          $answer: answer.trim(),
          $languageCode: languageCode,
          $questionId: questionId
        });

        return apiData({ id: translationId, languageCode, prompt: questionBody.trim(), answer: answer.trim() });
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
          $prompt: questionBody !== undefined ? questionBody.trim() : questionTranslation.prompt,
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
