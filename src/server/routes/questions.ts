import { sql } from 'bun';
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
  clarification?: string; // Required for TF questions when answer is false
}

interface QuestionImport {
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  translations: QuestionTranslation[];
}

interface QuestionsFileFormat {
  languages: LanguageDefinition[];
  questions: QuestionImport[];
}

interface Language {
  id: string;
  code: string;
  name: string;
  event_id: string;
}

interface QuestionDetail {
  id: string;
  number: number;
  type: string;
  max_points: number;
  seconds: number;
  event_id: string;
}

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
  const validTypes = new Set(['PG', 'PS', 'TF', 'FB']);

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
        error: `Question ${i + 1}${getPromptHint()}: Invalid type "${q.type}". Must be PG, PS, TF, or FB`
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
async function importQuestions(
  questions: QuestionImport[],
  eventId: string,
  languageCodeToIdMap: Map<string, string>
): Promise<number> {
  let imported = 0;

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    if (!question) continue; // Safety check

    const questionId = Bun.randomUUIDv7();
    const questionNumber = i + 1; // Assign question number based on position (1-indexed)

    // Insert question
    await sql`
      INSERT INTO questions (id, number, type, max_points, seconds, event_id)
      VALUES (${questionId}, ${questionNumber}, ${question.type}, ${question.maxPoints}, ${question.seconds}, ${eventId})
    `;

    // Insert question translation for each language
    for (const translation of question.translations) {
      const translationId = Bun.randomUUIDv7();

      // Convert boolean answers to string for storage
      const answerValue =
        typeof translation.answer === 'boolean' ? translation.answer.toString() : translation.answer.trim();

      const languageId = languageCodeToIdMap.get(translation.lang);
      if (!languageId) {
        throw new Error(`Language ID not found for code: ${translation.lang}`);
      }

      await sql`
        INSERT INTO translations (id, prompt, answer, clarification, language_id, question_id)
        VALUES (${translationId}, ${translation.prompt.trim()}, ${answerValue}, ${translation.clarification ? translation.clarification.trim() : null}, ${languageId}, ${questionId})
      `;
    }

    imported++;
  }

  return imported;
}

export const questionsRoutes: Routes = {
  '/api/events/:eventId/questions': {
    // Get all questions for an event with event name
    GET: async (req: BunRequest<'/api/events/:eventId/questions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions - allow any user with access to the event
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      // Get event name
      const events: { name: string }[] = await sql`
        SELECT events.name FROM events
        JOIN permissions ON events.id = permissions.event_id
        WHERE events.id = ${eventId} AND permissions.user_id = ${session.userId}
      `;

      if (events.length === 0) {
        return apiNotFound('Event not found');
      }

      const event = events[0]!;

      // Get all questions with translations in a single query (optimized)
      interface QuestionRow {
        question_id: string;
        number: number;
        type: string;
        max_points: number;
        seconds: number;
        translation_id: string | null;
        translation_language_id: string | null;
        translation_language_code: string | null;
        translation_prompt: string | null;
        translation_answer: string | null;
        translation_clarification: string | null;
      }

      const rows: QuestionRow[] = await sql`
        SELECT
          q.id as question_id,
          q.number,
          q.type,
          q.max_points,
          q.seconds,
          t.id as translation_id,
          t.language_id as translation_language_id,
          l.code as translation_language_code,
          t.prompt as translation_prompt,
          t.answer as translation_answer,
          t.clarification as translation_clarification
        FROM questions q
        LEFT JOIN translations t ON q.id = t.question_id
        LEFT JOIN languages l ON t.language_id = l.id
        WHERE q.event_id = ${eventId}
        ORDER BY q.number ASC, l.code ASC
      `;

      // Group translations by question
      const questionsMap = new Map<
        string,
        {
          id: string;
          number: number;
          type: string;
          maxPoints: number;
          seconds: number;
          translations: Record<
            string, // key: language code
            {
              id: string;
              languageCode: string;
              prompt: string | null;
              answer: string | null;
              clarification: string | null;
            }
          >;
        }
      >();

      for (const row of rows) {
        if (!questionsMap.has(row.question_id)) {
          questionsMap.set(row.question_id, {
            id: row.question_id,
            number: row.number,
            type: row.type,
            maxPoints: row.max_points,
            seconds: row.seconds,
            translations: {}
          });
        }

        // Add translation if it exists (LEFT JOIN may return null for questions without translations)
        // Index by languageCode instead of translationId
        if (row.translation_id && row.translation_language_code) {
          questionsMap.get(row.question_id)!.translations[row.translation_language_code] = {
            id: row.translation_id,
            languageCode: row.translation_language_code,
            prompt: row.translation_prompt,
            answer: row.translation_answer,
            clarification: row.translation_clarification
          };
        }
      }

      // Get event languages
      const languages: Language[] = await sql`
        SELECT id, code, name, event_id FROM languages WHERE event_id = ${eventId}
      `;

      return apiData({
        eventName: event.name,
        languages: Object.fromEntries(languages.map((l: Language) => [l.code, l.name])),
        questions: Object.fromEntries(questionsMap)
      });
    },

    // Add a new question (without info)
    POST: async (req: BunRequest<'/api/events/:eventId/questions'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
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
      const validTypes = new Set(['PG', 'PS', 'TF', 'FB']);
      if (!validTypes.has(type)) {
        return apiBadRequest('Invalid type. Must be PG, PS, TF, or FB');
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
          await sql`
            UPDATE questions SET number = (number * (-1)) - 1
            WHERE event_id = ${eventId} AND number >= ${insertBefore}
          `;

          await sql`
            UPDATE questions SET number = number * (-1)
            WHERE event_id = ${eventId} AND number < 0
          `;

          questionNumber = insertBefore;

          await sql`
            INSERT INTO questions (id, number, type, max_points, seconds, event_id)
            VALUES (${questionId}, ${questionNumber}, ${type}, ${maxPoints}, ${seconds}, ${eventId})
          `;
        } else {
          // Append to end: get the next available question number
          const maxResults: { max_number: number | null }[] = await sql`
            SELECT MAX(number) as max_number FROM questions WHERE event_id = ${eventId}
          `;
          const maxNumberResult = maxResults[0];
          questionNumber = (maxNumberResult?.max_number ?? 0) + 1;

          await sql`
            INSERT INTO questions (id, number, type, max_points, seconds, event_id)
            VALUES (${questionId}, ${questionNumber}, ${type}, ${maxPoints}, ${seconds}, ${eventId})
          `;
        }

        return apiData({ question: { id: questionId, number: questionNumber, type, maxPoints, seconds } });
      } catch (error) {
        console.error('Error creating question:', error);
        return apiServerError('Failed to create question');
      }
    }
  },
  '/api/events/:eventId/questions/import': {
    POST: async (req: BunRequest<'/api/events/:eventId/questions/import'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
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

      // Import questions and languages
      try {
        // Delete existing languages (this will cascade to translations and then questions due to foreign keys)
        await sql`DELETE FROM languages WHERE event_id = ${eventId}`;

        // Delete existing questions (in case cascade didn't catch everything)
        await sql`DELETE FROM questions WHERE event_id = ${eventId}`;

        // Insert new languages and create code-to-id mapping
        const languageCodeToIdMap = new Map<string, string>();

        for (const lang of validation.languages!) {
          const languageId = Bun.randomUUIDv7();
          await sql`
            INSERT INTO languages (id, code, name, event_id)
            VALUES (${languageId}, ${lang.code}, ${lang.name}, ${eventId})
          `;

          languageCodeToIdMap.set(lang.code, languageId);
        }

        // Import new questions
        await importQuestions(validation.questions!, eventId, languageCodeToIdMap);

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
    GET: async (req: BunRequest<'/api/events/:eventId/questions/export'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.eventId;

      // Check permissions - allow any user with access to the event
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      // Get event name for filename
      const events: { name: string }[] = await sql`
        SELECT events.name FROM events
        JOIN permissions ON events.id = permissions.event_id
        WHERE events.id = ${eventId} AND permissions.user_id = ${session.userId}
      `;

      if (events.length === 0) {
        return apiNotFound('Event not found');
      }

      const event = events[0]!;

      // Get all languages for this event
      const languages: Language[] = await sql`
        SELECT id, code, name, event_id FROM languages WHERE event_id = ${eventId}
      `;

      // Get all questions for this event
      interface QuestionExport {
        id: string;
        number: number;
        type: string;
        max_points: number;
        seconds: number;
      }
      const questions: QuestionExport[] = await sql`
        SELECT id, number, type, max_points, seconds FROM questions
        WHERE event_id = ${eventId}
        ORDER BY number ASC
      `;

      // Check if there's anything to export
      if (languages.length === 0 || questions.length === 0) {
        return apiBadRequest('Nothing to export - event has no languages or questions configured');
      }

      // Create a map of language ID to language code
      const languageIdToCodeMap = new Map<string, string>();

      for (const lang of languages) {
        languageIdToCodeMap.set(lang.id, lang.code);
      }

      // Build the languages array
      const languagesExport: LanguageDefinition[] = languages.map((l: Language) => ({
        code: l.code,
        name: l.name
      }));

      // Build the questions export data structure
      const questionsExport: QuestionImport[] = [];

      for (const question of questions) {
        interface QuestionTranslationRow {
          language_id: string;
          prompt: string;
          answer: string;
          clarification: string | null;
        }
        const questionTranslations: QuestionTranslationRow[] = await sql`
          SELECT language_id, prompt, answer, clarification FROM translations
          WHERE question_id = ${question.id}
          ORDER BY language_id ASC
        `;

        const translations: QuestionTranslation[] = questionTranslations.map((qt: QuestionTranslationRow) => {
          const langCode = languageIdToCodeMap.get(qt.language_id);

          if (!langCode) {
            throw new Error(`Language code not found for languageId: ${qt.language_id}`);
          }

          const translation: QuestionTranslation = {
            lang: langCode,
            prompt: qt.prompt,
            // Convert string "true"/"false" back to booleans for TF questions
            answer: question.type === 'TF' ? qt.answer === 'true' : qt.answer
          };

          // Add clarification if present
          if (qt.clarification) {
            translation.clarification = qt.clarification;
          }

          return translation;
        });

        questionsExport.push({
          type: question.type as 'PG' | 'PS' | 'TF' | 'FB',
          maxPoints: question.max_points,
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
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const questionId = req.params.questionId;

      // Get the question to verify it exists and get eventId
      interface QuestionDetail {
        id: string;
        number: number;
        type: string;
        max_points: number;
        seconds: number;
        event_id: string;
      }
      const questions: QuestionDetail[] = await sql`
        SELECT id, number, type, max_points, seconds, event_id FROM questions WHERE id = ${questionId}
      `;

      if (questions.length === 0) {
        return apiNotFound('Question not found');
      }

      const question = questions[0]!;

      // Check permissions
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${question.event_id} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();

      const { number, type, maxPoints, seconds } = body as {
        number?: number;
        type?: 'PG' | 'PS' | 'TF' | 'FB';
        maxPoints?: number;
        seconds?: number;
      };

      // Validate fields if provided
      if (number !== undefined && (typeof number !== 'number' || number <= 0)) {
        return apiBadRequest('number must be a positive number');
      }

      if (type !== undefined) {
        const validTypes = new Set(['PG', 'PS', 'TF', 'FB']);
        if (!validTypes.has(type)) {
          return apiBadRequest('Invalid type. Must be PG, PS, TF, or FB');
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

          // Step 1: Move current question to a temporary position (negative number)
          // This prevents conflicts with the UNIQUE constraint
          await sql`UPDATE questions SET number = ${-1} WHERE id = ${questionId}`;

          if (newNumber < oldNumber) {
            // Moving question to an earlier position (e.g., from 5 to 2)
            // Increment all questions from newNumber to oldNumber-1
            // Questions 2,3,4 become 3,4,5
            await sql`
              UPDATE questions
              SET number = number + 1
              WHERE event_id = ${question.event_id} AND number >= ${newNumber} AND number < ${oldNumber}
            `;
          } else {
            // Moving question to a later position (e.g., from 2 to 5)
            // Decrement all questions from oldNumber+1 to newNumber
            // Questions 3,4,5 become 2,3,4
            await sql`
              UPDATE questions
              SET number = number - 1
              WHERE event_id = ${question.event_id} AND number > ${oldNumber} AND number <= ${newNumber}
            `;
          }

          // Step 2: Move current question to its new position
          await sql`UPDATE questions SET number = ${newNumber} WHERE id = ${questionId}`;
        }

        // Update other fields (type, maxPoints, seconds)
        await sql`
          UPDATE questions
          SET number = ${number ?? question.number},
              type = ${type ?? question.type},
              max_points = ${maxPoints ?? question.max_points},
              seconds = ${seconds ?? question.seconds}
          WHERE id = ${questionId}
        `;

        return apiData();
      } catch (error) {
        console.error('Error updating question:', error);
        return apiServerError('Failed to update question');
      }
    },

    // Delete a question
    DELETE: async (req: BunRequest<'/api/questions/:questionId'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const questionId = req.params.questionId;

      // Get the question to verify it exists and get eventId
      const questions: QuestionDetail[] = await sql`
        SELECT id, number, type, max_points, seconds, event_id FROM questions WHERE id = ${questionId}
      `;

      if (questions.length === 0) {
        return apiNotFound('Question not found');
      }

      const question = questions[0]!;

      // Check permissions
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${question.event_id} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      try {
        // Delete the question
        await sql`DELETE FROM questions WHERE id = ${questionId}`;

        // Shift all questions after this one down by decrementing their numbers
        await sql`
          UPDATE questions SET number = number - 1
          WHERE event_id = ${question.event_id} AND number > ${question.number}
        `;

        return apiData();
      } catch (error) {
        console.error('Error deleting question:', error);
        return apiServerError('Failed to delete question');
      }
    }
  },

  // Add question translation
  '/api/questions/:questionId/translations': {
    POST: async (req: BunRequest<'/api/questions/:questionId/translations'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const questionId = req.params.questionId;

      // Get the question to verify it exists and get eventId
      const questions: QuestionDetail[] = await sql`
        SELECT id, number, type, max_points, seconds, event_id FROM questions WHERE id = ${questionId}
      `;

      if (questions.length === 0) {
        return apiNotFound('Question not found');
      }

      const question = questions[0]!;

      // Check permissions
      const permissions: { role_id: string }[] = await sql`
        SELECT role_id FROM permissions
        WHERE user_id = ${session.userId} AND event_id = ${question.event_id} AND role_id IN ('owner', 'admin')
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();
      let { languageCode, prompt, answer, clarification } = body;

      // Validate required fields
      if (typeof languageCode !== 'string' || typeof prompt !== 'string' || typeof answer !== 'string') {
        return apiBadRequest('Missing required fields: languageCode, prompt, and answer');
      }

      prompt = prompt?.trim();
      answer = answer?.trim();
      clarification = clarification?.trim();

      // Validate that the language exists for this event
      const languages: Language[] = await sql`
        SELECT id, code, name, event_id FROM languages WHERE event_id = ${question.event_id}
      `;
      const validLanguages = new Set(languages.map((l: Language) => l.code));

      if (!validLanguages.has(languageCode)) {
        return apiBadRequest(`Invalid language code "${languageCode}" for this event`);
      }

      // Get the language ID from the code
      const language = languages.find((l: Language) => l.code === languageCode);

      if (!language) {
        return apiBadRequest(`Language not found for code "${languageCode}"`);
      }

      // For TF questions, validate answer is "true" or "false" and require clarification
      if (question.type === 'TF') {
        const normalizedAnswer = answer.toLowerCase().trim();

        if (normalizedAnswer !== 'true' && normalizedAnswer !== 'false') {
          return apiBadRequest('True/False answer must be "true" or "false"');
        }
      }

      try {
        const translationId = Bun.randomUUIDv7();

        await sql`
          INSERT INTO translations (id, prompt, answer, clarification, language_id, question_id)
          VALUES (${translationId}, ${prompt}, ${answer}, ${clarification}, ${language.id}, ${questionId})
        `;

        return apiData({
          translation: { id: translationId, languageCode, prompt, answer, clarification }
        });
      } catch (error) {
        console.error('Error creating question translation:', error);
        return apiServerError('Failed to create question translation');
      }
    }
  },

  // Update question translation
  '/api/questions/translations/:translationId': {
    PATCH: async (req: BunRequest<'/api/questions/translations/:translationId'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const translationId = req.params.translationId;

      // Get the question translation to verify it exists
      const translations = await sql<{ id: string; prompt: string; answer: string; clarification: string; language_id: string; question_id: string }[]>`
        SELECT id, prompt, answer, clarification, language_id, question_id
        FROM translations
        WHERE id = ${translationId}
      `;

      if (translations.length === 0) {
        return apiNotFound('Question translation not found');
      }

      const questionTranslation = {
        id: translations[0]!.id,
        prompt: translations[0]!.prompt,
        answer: translations[0]!.answer,
        clarification: translations[0]!.clarification,
        languageId: translations[0]!.language_id,
        questionId: translations[0]!.question_id
      };

      // Get the parent question to check permissions
      const questions = await sql<{ id: string; number: number; type: string; max_points: number; seconds: number; event_id: string }[]>`
        SELECT id, number, type, max_points, seconds, event_id
        FROM questions
        WHERE id = ${questionTranslation.questionId}
      `;

      if (questions.length === 0) {
        return apiNotFound('Parent question not found');
      }

      const question = {
        id: questions[0]!.id,
        number: questions[0]!.number,
        type: questions[0]!.type,
        maxPoints: questions[0]!.max_points,
        seconds: questions[0]!.seconds,
        eventId: questions[0]!.event_id
      };

      // Check permissions
      const permissions = await sql<{ role_id: string }[]>`
        SELECT role_id
        FROM permissions
        WHERE user_id = ${session.userId}
        AND event_id = ${question.eventId}
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      // Parse request body
      const body = await req.json();

      const { prompt, answer, clarification } = body as {
        prompt?: string;
        answer?: string;
        clarification?: string;
      };

      // Validate fields if provided
      if (prompt !== undefined && typeof prompt !== 'string') {
        return apiBadRequest('prompt must be a string');
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
        await sql`
          UPDATE translations
          SET prompt = ${prompt !== undefined ? prompt.trim() : questionTranslation.prompt},
              answer = ${answer !== undefined ? answer.trim() : questionTranslation.answer},
              clarification = ${clarification !== undefined ? clarification.trim() : questionTranslation.clarification}
          WHERE id = ${translationId}
        `;

        return apiData();
      } catch (error) {
        console.error('Error updating question translation:', error);
        return apiServerError('Failed to update question translation');
      }
    },

    // Delete question translation
    DELETE: async (req: BunRequest<'/api/questions/translations/:translationId'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const translationId = req.params.translationId;

      // Get the question translation to verify it exists
      const translations = await sql<{ id: string; language_id: string; question_id: string }[]>`
        SELECT id, language_id, question_id
        FROM translations
        WHERE id = ${translationId}
      `;

      if (translations.length === 0) {
        return apiNotFound('Question translation not found');
      }

      const questionTranslation = {
        id: translations[0]!.id,
        languageId: translations[0]!.language_id,
        questionId: translations[0]!.question_id
      };

      // Get the parent question to check permissions
      const questions = await sql<{ id: string; event_id: string }[]>`
        SELECT id, event_id
        FROM questions
        WHERE id = ${questionTranslation.questionId}
      `;

      if (questions.length === 0) {
        return apiNotFound('Parent question not found');
      }

      const question = {
        id: questions[0]!.id,
        eventId: questions[0]!.event_id
      };

      // Check permissions
      const permissions = await sql<{ role_id: string }[]>`
        SELECT role_id
        FROM permissions
        WHERE user_id = ${session.userId}
        AND event_id = ${question.eventId}
      `;

      if (permissions.length === 0) {
        return apiForbidden();
      }

      try {
        await sql`DELETE FROM translations WHERE id = ${translationId}`;
        return apiData();
      } catch (error) {
        console.error('Error deleting question translation:', error);
        return apiServerError('Failed to delete question translation');
      }
    }
  }
};
