import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import { apiData, apiForbidden, apiUnauthorized } from '@/server/utils/responses';
import { sql, type BunRequest } from 'bun';

export const answersRoutes: Routes = {
  '/api/events/:id/answers': {
    GET: async (req: BunRequest<'/api/events/:id/answers'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const eventId = req.params.id;

      const result: { id: string; name: string }[] = await sql`
          SELECT events.id, events.name
          FROM events
          JOIN permissions ON events.id = permissions.event_id
          WHERE permissions.user_id = ${session.user_id} AND events.id = ${eventId} AND permissions.role_id IN ('owner', 'admin', 'judge')
        `;

      const event = result[0] || null;

      if (!event) {
        return apiForbidden();
      }

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

      // Query all answers
      const answersData: {
        question_id: string;
        answer_id: string;
        translation_id: string;
        team_id: string;
        team_number: number;
        points_awarded: number | null;
        auto_points_awarded: number | null;
      }[] = await sql`
        SELECT
          a.question_id,
          a.id as answer_id,
          a.translation_id,
          a.team_id,
          t.number as team_number,
          a.points_awarded,
          a.auto_points_awarded
        FROM answers a
        JOIN questions q ON a.question_id = q.id
        JOIN teams t ON a.team_id = t.id
        WHERE q.event_id = ${eventId}
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
              answerId: string;
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

      // Then, add answers to questions
      for (const row of answersData) {
        const question = questionsMap.get(row.question_id);
        if (question) {
          question.answers[row.translation_id] = {
            answerId: row.answer_id,
            teamId: row.team_id,
            teamNumber: row.team_number,
            points: row.points_awarded,
            autoPoints: row.auto_points_awarded
          };
        }
      }

      // Convert map to array sorted by question number
      const questions = Array.from(questionsMap.values()).sort((a, b) => a.number - b.number);

      return apiData({ eventName: event.name, questions });
    }
  }
};
