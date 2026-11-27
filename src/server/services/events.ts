// Events: list, create, rename, delete and duplicate. Callers check permissions first.
import { sql } from 'bun';
import type { Role } from '@/server/services/permissions';

export interface EventListItem {
  id: string;
  name: string;
  role_id: Role;
}

export async function listEventsForUser(userId: string): Promise<EventListItem[]> {
  return await sql`
    SELECT events.id, events.name, permissions.role_id
    FROM events
    JOIN permissions ON events.id = permissions.event_id
    WHERE permissions.user_id = ${userId}
    ORDER BY events.name ASC
  `;
}

// The event's id and name, or null.
export async function getEventName(eventId: string) {
  const rows: { id: string; name: string }[] = await sql`SELECT id, name FROM events WHERE id = ${eventId}`;

  return rows[0] ?? null;
}

export async function eventExists(eventId: string) {
  const rows: { id: string }[] = await sql`SELECT id FROM events WHERE id = ${eventId}`;

  return rows.length > 0;
}

// Creates the event with its run, owned by `userId`.
export async function createEvent(userId: string, name: string) {
  const id = Bun.randomUUIDv7();

  await sql.begin(async (tx) => {
    await tx`INSERT INTO events (id, name) VALUES (${id}, ${name})`;
    await tx`INSERT INTO permissions (user_id, event_id, role_id) VALUES (${userId}, ${id}, ${'owner'})`;
    await tx`INSERT INTO runs (event_id, status, grace_period) VALUES (${id}, 'not_started', 2)`;
  });

  return { id, name, roleId: 'owner' as const };
}

export async function renameEvent(eventId: string, name: string) {
  await sql`UPDATE events SET name = ${name} WHERE id = ${eventId}`;
}

export async function deleteEvent(eventId: string) {
  await sql`DELETE FROM events WHERE id = ${eventId}`;
}

// Copies the event with everything in it (languages, questions, slides, run, teams and answers),
// owned by `userId`.
export async function duplicateEvent(sourceEventId: string, userId: string, name: string) {
  return await sql.begin(async (tx) => {
    // 1. Create new event
    const newEventId = Bun.randomUUIDv7();
    await tx`INSERT INTO events (id, name, title_remarks)
        SELECT ${newEventId}, ${name}, title_remarks
        FROM events WHERE id = ${sourceEventId}`;

    // 2. Create permission for current user as owner
    await tx`INSERT INTO permissions (user_id, event_id, role_id)
        VALUES (${userId}, ${newEventId}, 'owner')`;

    // 3. Duplicate languages and build ID mapping (before runs, needed for active_item remapping)
    const sourceLanguages: Array<{ id: string; name: string; code: string }> =
      await tx`SELECT id, name, code FROM languages WHERE event_id = ${sourceEventId} ORDER BY id`;

    const languageIdMap = new Map<string, string>();
    for (const lang of sourceLanguages) {
      const newLangId = Bun.randomUUIDv7();
      languageIdMap.set(lang.id, newLangId);
      await tx`INSERT INTO languages (id, event_id, name, code)
          VALUES (${newLangId}, ${newEventId}, ${lang.name}, ${lang.code})`;
    }

    // 4. Duplicate questions and build ID mapping (before runs, needed for active_item remapping)
    const sourceQuestions: Array<{
      id: string;
      number: number;
      type: string;
      max_points: number;
      seconds: number;
    }> = await tx`SELECT id, number, type, max_points, seconds
        FROM questions WHERE event_id = ${sourceEventId} ORDER BY number`;

    const questionIdMap = new Map<string, string>();
    const questionNumberToIdMap = new Map<number, string>();
    for (const question of sourceQuestions) {
      const newQuestionId = Bun.randomUUIDv7();
      questionIdMap.set(question.id, newQuestionId);
      questionNumberToIdMap.set(question.number, newQuestionId);
      await tx`INSERT INTO questions (id, event_id, number, type, max_points, seconds)
          VALUES (${newQuestionId}, ${newEventId}, ${question.number}, ${question.type},
            ${question.max_points}, ${question.seconds})`;
    }

    // 5. Duplicate slides and build ID mapping (before runs, needed for active_item remapping)
    const sourceSlides: Array<{
      id: string;
      number: number;
      content: string;
    }> = await tx`SELECT id, number, content
        FROM slides WHERE event_id = ${sourceEventId} ORDER BY number`;

    const slideNumberToIdMap = new Map<number, string>();
    for (const slide of sourceSlides) {
      const newSlideId = Bun.randomUUIDv7();
      slideNumberToIdMap.set(slide.number, newSlideId);
      await tx`INSERT INTO slides (id, event_id, number, content)
          VALUES (${newSlideId}, ${newEventId}, ${slide.number}, ${slide.content})`;
    }

    // 6. Create run record with remapped active_item
    const sourceRun: Array<{ status: string; grace_period: number; active_item: any }> =
      await tx`SELECT status, grace_period, active_item FROM runs WHERE event_id = ${sourceEventId}`;

    let activeItem = sourceRun[0]?.active_item;

    // Remap IDs in active_item if needed
    if (activeItem && typeof activeItem === 'object') {
      if (activeItem.type === 'question' && activeItem.number !== undefined) {
        const newQuestionId = questionNumberToIdMap.get(activeItem.number);
        if (newQuestionId) {
          activeItem = { ...activeItem, id: newQuestionId };
        }
      } else if (activeItem.type === 'slide' && activeItem.number !== undefined) {
        const newSlideId = slideNumberToIdMap.get(activeItem.number);
        if (newSlideId) {
          activeItem = { ...activeItem, id: newSlideId };
        }
      }
    }

    await tx`INSERT INTO runs (event_id, status, grace_period, active_item)
        VALUES (${newEventId}, ${sourceRun[0]?.status || 'not_started'},
          ${sourceRun[0]?.grace_period || 2}, ${activeItem}::jsonb)`;

    // 7. Duplicate translations and build ID mapping
    const sourceTranslations: Array<{
      id: string;
      question_id: string;
      language_id: string;
      prompt: string;
      answer: string;
      clarification: string | null;
    }> = await tx`SELECT id, question_id, language_id, prompt, answer, clarification
        FROM translations t
        WHERE question_id IN (
          SELECT id FROM questions WHERE event_id = ${sourceEventId}
        )`;

    const translationIdMap = new Map<string, string>();
    for (const translation of sourceTranslations) {
      const newTranslationId = Bun.randomUUIDv7();
      const newQuestionId = questionIdMap.get(translation.question_id);
      const newLanguageId = languageIdMap.get(translation.language_id);

      if (!newQuestionId || !newLanguageId) continue;

      translationIdMap.set(translation.id, newTranslationId);
      await tx`INSERT INTO translations (id, question_id, language_id, prompt, answer, clarification)
          VALUES (${newTranslationId}, ${newQuestionId}, ${newLanguageId},
            ${translation.prompt}, ${translation.answer}, ${translation.clarification})`;
    }

    // 8. Duplicate teams and build ID mapping
    const sourceTeams: Array<{
      id: string;
      number: number;
      name: string;
      language_id: string;
    }> = await tx`SELECT id, number, name, language_id
        FROM teams WHERE event_id = ${sourceEventId} ORDER BY number`;

    const teamIdMap = new Map<string, string>();
    for (const team of sourceTeams) {
      const newTeamId = Bun.randomUUIDv7();
      const newLanguageId = languageIdMap.get(team.language_id);

      if (!newLanguageId) continue;

      teamIdMap.set(team.id, newTeamId);
      await tx`INSERT INTO teams (id, event_id, number, name, language_id)
          VALUES (${newTeamId}, ${newEventId}, ${team.number}, ${team.name}, ${newLanguageId})`;
    }

    // 9. Duplicate answers
    const sourceAnswers: Array<{
      id: string;
      question_id: string;
      team_id: string;
      translation_id: string;
      answer: string;
      auto_points_awarded: number | null;
      points_awarded: number | null;
    }> = await tx`SELECT id, question_id, team_id, translation_id, answer,
        auto_points_awarded, points_awarded
        FROM answers WHERE question_id IN (
          SELECT id FROM questions WHERE event_id = ${sourceEventId}
        )`;

    for (const answer of sourceAnswers) {
      const newAnswerId = Bun.randomUUIDv7();
      const newQuestionId = questionIdMap.get(answer.question_id);
      const newTeamId = teamIdMap.get(answer.team_id);
      const newTranslationId = translationIdMap.get(answer.translation_id);

      if (!newQuestionId || !newTeamId || !newTranslationId) continue;

      await tx`INSERT INTO answers (id, question_id, team_id, translation_id, answer,
          auto_points_awarded, points_awarded)
          VALUES (${newAnswerId}, ${newQuestionId}, ${newTeamId}, ${newTranslationId},
            ${answer.answer}, ${answer.auto_points_awarded}, ${answer.points_awarded})`;
    }

    return { id: newEventId, name, roleId: 'owner' as const };
  });
}

export async function setTitleRemarks(eventId: string, titleRemarks: string) {
  await sql`UPDATE events SET title_remarks = ${titleRemarks} WHERE id = ${eventId}`;
}
