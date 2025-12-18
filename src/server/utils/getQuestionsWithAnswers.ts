import { sql } from "bun";

export const getQuestionsWithAnswers = async (eventId: string) => {
  // Query all questions with their translations
  const questionsData: {
    id: string;
    number: number;
    type: 'PG' | 'PS' | 'TF' | 'FB';
    max_points: number;
    seconds: number;
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
        autoPoints: row.auto_points_awarded
      };
    }
  }

  // Convert map to array sorted by question number
  const questions = Array.from(questionsMap.values()).sort((a, b) => a.number - b.number);

  return questions;
};
