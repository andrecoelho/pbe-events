import { sql } from 'bun';

// Not yet scoped to an event: #43 adds that for the WebSocket writes.
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
