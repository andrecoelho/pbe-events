import type { ActiveItem } from '@/types';
import { sql } from 'bun';

// Every question with its translations and an entry per team (answerText null when the team has not answered).
export async function getQuestionsWithAnswers(eventId: string) {
  // Query all questions with their translations
  const questionsData: {
    id: string;
    number: number;
    type: 'PG' | 'PS' | 'TF' | 'FB';
    max_points: number;
    seconds: number;
    locked: boolean;
    graded: boolean;
    translation_id: string;
    language_code: string;
    language_name: string;
    prompt: string;
    answer: string;
    clarification: string;
  }[] = await sql`
          SELECT
            q.id,
            q.number,
            q.type,
            q.max_points,
            q.seconds,
            q.locked,
            q.graded,
            tr.id as translation_id,
            l.code as language_code,
            l.name as language_name,
            tr.prompt,
            tr.answer,
            tr.clarification
          FROM questions q
          JOIN translations tr ON q.id = tr.question_id
          JOIN languages l ON tr.language_id = l.id
          WHERE q.event_id = ${eventId}
          ORDER BY q.number, l.code
        `;

  // Query all teams with their answers (answers can be null)
  const answersData: {
    question_id: string;
    answer_id: string | null;
    answer: string | null;
    challenged: boolean | null;
    translation_id: string | null;
    language_code: string | null;
    team_id: string;
    team_number: number;
    points_awarded: number | null;
    auto_points_awarded: number | null;
  }[] = await sql`
          SELECT
            q.id as question_id,
            a.id as answer_id,
            a.answer,
            a.challenged,
            a.translation_id,
            l.code as language_code,
            t.id as team_id,
            t.number as team_number,
            a.points_awarded,
            a.auto_points_awarded
          FROM questions q
          CROSS JOIN teams t
          LEFT JOIN answers a ON a.question_id = q.id AND a.team_id = t.id
          LEFT JOIN translations tr ON a.translation_id = tr.id
          LEFT JOIN languages l ON tr.language_id = l.id
          WHERE q.event_id = ${eventId} AND t.event_id = ${eventId}
          ORDER BY q.number, t.number
        `;

  // Build questions array with nested translations and answers
  const questionsMap = new Map<
    string,
    {
      id: string;
      number: number;
      type: 'PG' | 'PS' | 'TF' | 'FB';
      maxPoints: number;
      seconds: number;
      locked: boolean;
      graded: boolean;
      translations: {
        languageCode: string;
        languageName: string;
        prompt: string;
        answer: string;
        clarification: string;
      }[];
      answers: Record<
        string,
        {
          answerId: string | null;
          answerText: string | null;
          languageCode: string | null;
          teamId: string;
          teamNumber: number;
          points: number | null;
          autoPoints: number | null;
          challenged: boolean | null;
        }
      >;
    }
  >();

  // First, build questions with translations
  for (const row of questionsData) {
    if (!questionsMap.has(row.id)) {
      questionsMap.set(row.id, {
        id: row.id,
        number: row.number,
        type: row.type,
        maxPoints: row.max_points,
        seconds: row.seconds,
        locked: row.locked,
        graded: row.graded,
        translations: [],
        answers: {}
      });
    }

    questionsMap.get(row.id)!.translations.push({
      languageCode: row.language_code,
      languageName: row.language_name,
      prompt: row.prompt,
      answer: row.answer,
      clarification: row.clarification
    });
  }

  // Then, add answers to questions (including null answers for teams without responses)
  for (const row of answersData) {
    const question = questionsMap.get(row.question_id);

    if (question) {
      question.answers[row.team_id] = {
        answerId: row.answer_id || null,
        answerText: row.answer || null,
        languageCode: row.language_code || null,
        teamId: row.team_id,
        teamNumber: row.team_number,
        points: row.points_awarded,
        autoPoints: row.auto_points_awarded,
        challenged: row.challenged
      };
    }
  }

  // Convert map to array sorted by question number
  const questions = Array.from(questionsMap.values()).sort((a, b) => a.number - b.number);

  return questions;
}

type QuestionItem = Extract<ActiveItem, { type: 'question'; phase: 'prompt' | 'answer' }>;

// Every team's answer to one question (#54), keyed by team id, as the live run shows them: a team that hasn't
// answered has answerId null. The answers table is the source of truth; the run's active item holds a copy
// only in memory.
export async function getQuestionAnswers(eventId: string, questionId: string): Promise<QuestionItem['answers']> {
  const rows: {
    team_id: string;
    team_number: number;
    answer_id: string | null;
    answer: string | null;
    language_code: string | null;
    points_awarded: number | null;
    auto_points_awarded: number | null;
    challenged: boolean | null;
  }[] = await sql`
    SELECT t.id AS team_id, t.number AS team_number, a.id AS answer_id, a.answer, l.code AS language_code,
      a.points_awarded, a.auto_points_awarded, a.challenged
    FROM teams t
    LEFT JOIN answers a ON a.team_id = t.id AND a.question_id = ${questionId}
    LEFT JOIN translations tr ON tr.id = a.translation_id
    LEFT JOIN languages l ON l.id = tr.language_id
    WHERE t.event_id = ${eventId}
    ORDER BY t.number
  `;

  return Object.fromEntries(
    rows.map((row) => [
      row.team_id,
      {
        answerId: row.answer_id,
        answerText: row.answer,
        languageCode: row.language_code,
        teamId: row.team_id,
        teamNumber: row.team_number,
        points: row.points_awarded,
        autoPoints: row.auto_points_awarded,
        challenged: row.challenged
      }
    ])
  );
}

// The item with its answers read from the answers table, when it's a question taking or showing answers.
export async function withAnswers<T extends ActiveItem | null>(eventId: string, item: T): Promise<T> {
  if (item?.type === 'question' && item.phase !== 'reading') {
    return { ...item, answers: await getQuestionAnswers(eventId, item.id) };
  }

  return item;
}

export async function saveAnswer(answer: { questionId: string; teamId: string; translationId: string; text: string }) {
  // A new answer replaces the team's earlier one and clears its grading and challenge.
  const rows: { id: string }[] = await sql`
    INSERT INTO answers (id, answer, question_id, team_id, translation_id, created_at, updated_at)
    VALUES (${Bun.randomUUIDv7()}, ${answer.text}, ${answer.questionId}, ${answer.teamId}, ${answer.translationId},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (question_id, team_id)
    DO UPDATE SET answer = EXCLUDED.answer, points_awarded = NULL, auto_points_awarded = NULL, challenged = false,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `;

  return rows[0]!.id;
}

export async function setAnswerChallenged(eventId: string, answerId: string, challenged: boolean) {
  await sql`
    UPDATE answers a SET challenged = ${challenged}
    FROM questions q
    WHERE a.id = ${answerId} AND q.id = a.question_id AND q.event_id = ${eventId}
  `;
}

// Returns the answer's question and team, or null when the event has no such answer.
export async function setAnswerPoints(eventId: string, answerId: string, points: number | null) {
  const rows: { question_id: string; team_id: string }[] = await sql`
    UPDATE answers a SET points_awarded = ${points}
    FROM questions q
    WHERE a.id = ${answerId} AND q.id = a.question_id AND q.event_id = ${eventId}
    RETURNING a.question_id, a.team_id
  `;

  return rows[0] ?? null;
}
