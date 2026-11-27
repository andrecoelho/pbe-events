// Questions and their translations. Callers check permissions first.
import type { LanguageDefinition, QuestionImport, QuestionTranslation } from '@/server/questionsFile';
import { badRequest, conflict } from '@/server/http/route';
import { sql } from 'bun';

export type QuestionType = 'PG' | 'PS' | 'TF' | 'FB';

export interface Question {
  id: string;
  number: number;
  type: QuestionType;
  max_points: number;
  seconds: number;
  event_id: string;
}

export interface Translation {
  id: string;
  prompt: string;
  answer: string;
  clarification: string | null;
  language_id: string;
  question_id: string;
}

// Question numbers are unique per event, so renumbering goes through negative numbers first;
// otherwise two questions can share a number midway through the UPDATE.
type Tx = Bun.TransactionSQL;

async function shiftNumbers(tx: Tx, eventId: string, from: number, to: number, by: 1 | -1) {
  await tx`
    UPDATE questions SET number = -(number + ${by})
    WHERE event_id = ${eventId} AND number >= ${from} AND number <= ${to}
  `;
  await tx`UPDATE questions SET number = -number WHERE event_id = ${eventId} AND number < 0`;
}

export async function getQuestion(questionId: string): Promise<Question | null> {
  const rows: Question[] = await sql`
    SELECT id, number, type, max_points, seconds, event_id FROM questions WHERE id = ${questionId}
  `;

  return rows[0] ?? null;
}

// Every question with its translations keyed by language code, for the questions page.
export async function listQuestionsForEditor(eventId: string) {
  const rows: {
    question_id: string;
    number: number;
    type: QuestionType;
    max_points: number;
    seconds: number;
    translation_id: string | null;
    translation_language_code: string | null;
    translation_prompt: string | null;
    translation_answer: string | null;
    translation_clarification: string | null;
  }[] = await sql`
    SELECT
      q.id AS question_id,
      q.number,
      q.type,
      q.max_points,
      q.seconds,
      t.id AS translation_id,
      l.code AS translation_language_code,
      t.prompt AS translation_prompt,
      t.answer AS translation_answer,
      t.clarification AS translation_clarification
    FROM questions q
    LEFT JOIN translations t ON q.id = t.question_id
    LEFT JOIN languages l ON t.language_id = l.id
    WHERE q.event_id = ${eventId}
    ORDER BY q.number ASC, l.code ASC
  `;

  const questions = new Map<
    string,
    {
      id: string;
      number: number;
      type: QuestionType;
      maxPoints: number;
      seconds: number;
      translations: Record<
        string,
        { id: string; languageCode: string; prompt: string | null; answer: string | null; clarification: string | null }
      >;
    }
  >();

  for (const row of rows) {
    let question = questions.get(row.question_id);

    if (!question) {
      question = {
        id: row.question_id,
        number: row.number,
        type: row.type,
        maxPoints: row.max_points,
        seconds: row.seconds,
        translations: {}
      };
      questions.set(row.question_id, question);
    }

    // The LEFT JOIN gives a row with no translation for a question that has none.
    if (row.translation_id && row.translation_language_code) {
      question.translations[row.translation_language_code] = {
        id: row.translation_id,
        languageCode: row.translation_language_code,
        prompt: row.translation_prompt,
        answer: row.translation_answer,
        clarification: row.translation_clarification
      };
    }
  }

  return Object.fromEntries(questions);
}

// Adds a question at the end, or at `insertBefore`, moving the later questions down one.
export async function createQuestion(
  eventId: string,
  question: { type: QuestionType; maxPoints: number; seconds: number; insertBefore?: number }
) {
  const id = Bun.randomUUIDv7();

  const number = await sql.begin(async (tx) => {
    let number: number;

    if (question.insertBefore !== undefined) {
      number = question.insertBefore;
      await shiftNumbers(tx, eventId, number, Number.MAX_SAFE_INTEGER, 1);
    } else {
      const rows: { max_number: number | null }[] = await tx`
        SELECT MAX(number) AS max_number FROM questions WHERE event_id = ${eventId}
      `;
      number = (rows[0]?.max_number ?? 0) + 1;
    }

    await tx`
      INSERT INTO questions (id, number, type, max_points, seconds, event_id)
      VALUES (${id}, ${number}, ${question.type}, ${question.maxPoints}, ${question.seconds}, ${eventId})
    `;

    return number;
  });

  return { id, number, type: question.type, maxPoints: question.maxPoints, seconds: question.seconds };
}

// Changes the given fields. A new number moves the question there and shifts the ones in between.
export async function updateQuestion(
  question: Question,
  changes: { number?: number; type?: QuestionType; maxPoints?: number; seconds?: number }
) {
  await sql.begin(async (tx) => {
    const { number } = changes;

    if (number !== undefined && number !== question.number) {
      // Out of the way first, so the shift doesn't collide with it.
      await tx`UPDATE questions SET number = 0 WHERE id = ${question.id}`;

      if (number < question.number) {
        await shiftNumbers(tx, question.event_id, number, question.number - 1, 1);
      } else {
        await shiftNumbers(tx, question.event_id, question.number + 1, number, -1);
      }
    }

    await tx`
      UPDATE questions
      SET number = ${number ?? question.number},
          type = ${changes.type ?? question.type},
          max_points = ${changes.maxPoints ?? question.max_points},
          seconds = ${changes.seconds ?? question.seconds}
      WHERE id = ${question.id}
    `;
  });
}

// Deletes the question and moves the later ones up one.
export async function deleteQuestion(question: Question) {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM questions WHERE id = ${question.id}`;
    await shiftNumbers(tx, question.event_id, question.number + 1, Number.MAX_SAFE_INTEGER, -1);
  });
}

export interface ReplaceQuestionsOptions {
  // Code of a file language to move teams to when their language isn't in the file.
  teamLanguage?: string;
  // Allow erasing the answers (and grades) already recorded for the event's questions.
  deleteAnswers?: boolean;
}

// A language the file leaves out while teams still use it.
export interface MissingLanguage {
  code: string;
  name: string;
  teamCount: number;
}

// Replaces the event's questions with the file's, all or nothing. Languages are matched by code:
// existing ones keep their id (so teams keep them) and take the file's name, new ones are added, and
// ones the file leaves out are deleted. Throws a 409 when that would strand teams on a deleted
// language or erase recorded answers, unless the options say how to resolve it.
export async function replaceQuestions(
  eventId: string,
  languages: LanguageDefinition[],
  questions: QuestionImport[],
  options: ReplaceQuestionsOptions = {}
) {
  const fileCodes = new Set(languages.map((language) => language.code));

  if (options.teamLanguage !== undefined && !fileCodes.has(options.teamLanguage)) {
    throw badRequest(`Language "${options.teamLanguage}" is not in the file`);
  }

  await sql.begin(async (tx) => {
    // Lock the event's languages so teams can't be moved onto one mid-import.
    const existing: { id: string; code: string; name: string }[] = await tx`
      SELECT id, code, name FROM languages WHERE event_id = ${eventId} ORDER BY code FOR UPDATE
    `;
    const dropped = existing.filter((language) => !fileCodes.has(language.code));
    const teamCounts: { language_id: string; count: number }[] = await tx`
      SELECT language_id, COUNT(*)::int AS count FROM teams WHERE event_id = ${eventId} GROUP BY language_id
    `;
    const teamsByLanguage = new Map(teamCounts.map((row) => [row.language_id, row.count]));
    const missingLanguages: MissingLanguage[] = dropped
      .filter((language) => teamsByLanguage.has(language.id))
      .map((language) => ({ code: language.code, name: language.name, teamCount: teamsByLanguage.get(language.id)! }));
    const answerRows: { count: number }[] = await tx`
      SELECT COUNT(*)::int AS count FROM answers a JOIN questions q ON q.id = a.question_id WHERE q.event_id = ${eventId}
    `;
    const answerCount = answerRows[0]?.count ?? 0;

    const languagesUnresolved = missingLanguages.length > 0 && options.teamLanguage === undefined;
    const answersUnresolved = answerCount > 0 && !options.deleteAnswers;

    if (languagesUnresolved || answersUnresolved) {
      const reasons = [
        languagesUnresolved &&
          `teams use ${missingLanguages.map((language) => `${language.name} (${language.code})`).join(', ')}, which the file leaves out`,
        answersUnresolved && `importing would erase ${answerCount} recorded answer${answerCount === 1 ? '' : 's'}`
      ].filter(Boolean);

      throw conflict(`Can't import yet: ${reasons.join('; ')}.`, {
        missingLanguages: languagesUnresolved ? missingLanguages : [],
        answerCount: answersUnresolved ? answerCount : 0,
        fileLanguages: languages
      });
    }

    const languageIds = new Map<string, string>();
    const existingByCode = new Map(existing.map((language) => [language.code, language]));

    for (const language of languages) {
      const current = existingByCode.get(language.code);

      if (current) {
        if (current.name !== language.name) {
          await tx`UPDATE languages SET name = ${language.name} WHERE id = ${current.id}`;
        }

        languageIds.set(language.code, current.id);
      } else {
        const id = Bun.randomUUIDv7();
        await tx`INSERT INTO languages (id, code, name, event_id) VALUES (${id}, ${language.code}, ${language.name}, ${eventId})`;
        languageIds.set(language.code, id);
      }
    }

    if (dropped.length > 0) {
      const droppedIds = dropped.map((language) => language.id);

      if (options.teamLanguage !== undefined) {
        await tx`
          UPDATE teams SET language_id = ${languageIds.get(options.teamLanguage)!}
          WHERE event_id = ${eventId} AND language_id IN ${sql(droppedIds)}
        `;
      }

      // Their translations go with them.
      await tx`DELETE FROM languages WHERE id IN ${sql(droppedIds)}`;
    }

    // Deleting the questions also deletes their translations and answers.
    await tx`DELETE FROM questions WHERE event_id = ${eventId}`;

    for (const [index, question] of questions.entries()) {
      const questionId = Bun.randomUUIDv7();

      await tx`
        INSERT INTO questions (id, number, type, max_points, seconds, event_id)
        VALUES (${questionId}, ${index + 1}, ${question.type}, ${question.maxPoints}, ${question.seconds}, ${eventId})
      `;

      for (const translation of question.translations) {
        const languageId = languageIds.get(translation.lang);

        if (!languageId) {
          throw new Error(`Language ID not found for code: ${translation.lang}`);
        }

        // TF answers are stored as "true"/"false".
        const answer = typeof translation.answer === 'boolean' ? String(translation.answer) : translation.answer.trim();

        await tx`
          INSERT INTO translations (id, prompt, answer, clarification, language_id, question_id)
          VALUES (${Bun.randomUUIDv7()}, ${translation.prompt.trim()}, ${answer},
            ${translation.clarification ? translation.clarification.trim() : null}, ${languageId}, ${questionId})
        `;
      }
    }
  });
}

// The event's languages and questions in the YAML file's shape.
export async function getQuestionsForExport(eventId: string) {
  const languages: { id: string; code: string; name: string }[] = await sql`
    SELECT id, code, name FROM languages WHERE event_id = ${eventId}
  `;
  const questions: Question[] = await sql`
    SELECT id, number, type, max_points, seconds, event_id FROM questions WHERE event_id = ${eventId} ORDER BY number
  `;
  const translations: (Translation & { language_id: string })[] = await sql`
    SELECT t.id, t.prompt, t.answer, t.clarification, t.language_id, t.question_id
    FROM translations t
    JOIN questions q ON q.id = t.question_id
    WHERE q.event_id = ${eventId}
    ORDER BY t.language_id ASC
  `;

  const codes = new Map(languages.map((language) => [language.id, language.code]));

  return {
    languages: languages.map(({ code, name }) => ({ code, name })),
    questions: questions.map((question): QuestionImport => ({
      type: question.type,
      maxPoints: question.max_points,
      seconds: question.seconds,
      translations: translations
        .filter((t) => t.question_id === question.id)
        .map((t) => {
          const lang = codes.get(t.language_id);

          if (!lang) {
            throw new Error(`Language code not found for languageId: ${t.language_id}`);
          }

          const translation: QuestionTranslation = {
            lang,
            prompt: t.prompt,
            // TF answers go back to booleans.
            answer: question.type === 'TF' ? t.answer === 'true' : t.answer
          };

          if (t.clarification) {
            translation.clarification = t.clarification;
          }

          return translation;
        })
    }))
  };
}

// The translation with its question's event and type, or null.
export async function getTranslationWithQuestion(translationId: string) {
  const rows: (Translation & { event_id: string; type: QuestionType })[] = await sql`
    SELECT t.id, t.prompt, t.answer, t.clarification, t.language_id, t.question_id, q.event_id, q.type
    FROM translations t
    JOIN questions q ON q.id = t.question_id
    WHERE t.id = ${translationId}
  `;

  return rows[0] ?? null;
}

export async function addTranslation(translation: {
  questionId: string;
  languageId: string;
  prompt: string;
  answer: string;
  clarification?: string;
}) {
  const id = Bun.randomUUIDv7();

  await sql`
    INSERT INTO translations (id, prompt, answer, clarification, language_id, question_id)
    VALUES (${id}, ${translation.prompt}, ${translation.answer}, ${translation.clarification ?? null},
      ${translation.languageId}, ${translation.questionId})
  `;

  return id;
}

export async function updateTranslation(translation: Translation) {
  await sql`
    UPDATE translations
    SET prompt = ${translation.prompt}, answer = ${translation.answer}, clarification = ${translation.clarification}
    WHERE id = ${translation.id}
  `;
}

export async function deleteTranslation(translationId: string) {
  await sql`DELETE FROM translations WHERE id = ${translationId}`;
}

// Used by the live run. Not yet scoped to an event: #43 adds that for the WebSocket writes.
export async function setQuestionLocked(questionId: string, locked: boolean) {
  await sql`UPDATE questions SET locked = ${locked} WHERE id = ${questionId}`;
}

export async function setQuestionGraded(questionId: string, graded: boolean) {
  await sql`UPDATE questions SET graded = ${graded} WHERE id = ${questionId}`;
}

// The question's translation in a language, with the language code.
export async function getTranslation(questionId: string, languageId: string) {
  const rows: { id: string; language_code: string }[] = await sql`
    SELECT tr.id, l.code AS language_code
    FROM translations tr
    JOIN languages l ON tr.language_id = l.id
    WHERE tr.question_id = ${questionId} AND tr.language_id = ${languageId}
  `;

  return rows[0] ?? null;
}
