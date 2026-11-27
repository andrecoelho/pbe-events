// The writes a live run makes (grading, locking, challenges) only touch the event they're given (#43).
// Runs only when POSTGRES_URL is a local dev database (`mise run db`); CI has none, so it skips there.
import { getQuestionAnswers, setAnswerChallenged, setAnswerPoints } from '@/server/services/answers';
import { getRun, saveActiveItem } from '@/server/services/runs';
import type { ActiveItem } from '@/types';
import { setQuestionGraded, setQuestionLocked } from '@/server/services/questions';
import { afterEach, describe, expect, test } from 'bun:test';
import { sql } from 'bun';

function isLocalDatabase() {
  try {
    const url = new URL(process.env.POSTGRES_URL ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['15432', '15433'].includes(url.port);
  } catch {
    return false;
  }
}

const events: string[] = [];

// An event with one question, one team and that team's answer.
async function makeEvent() {
  const eventId = `test-live-${Bun.randomUUIDv7()}`;
  const id = (name: string) => `${eventId}-${name}`;
  events.push(eventId);

  await sql`INSERT INTO events (id, name) VALUES (${eventId}, 'Live writes test')`;
  await sql`INSERT INTO languages (id, code, name, event_id) VALUES (${id('en')}, 'en', 'English', ${eventId})`;
  await sql`INSERT INTO teams (id, number, name, event_id, language_id) VALUES (${id('t')}, 1, 'T', ${eventId}, ${id('en')})`;
  await sql`
    INSERT INTO questions (id, number, type, max_points, seconds, event_id)
    VALUES (${id('q')}, 1, 'PG', 4, 30, ${eventId})
  `;
  await sql`
    INSERT INTO translations (id, prompt, answer, language_id, question_id)
    VALUES (${id('tr')}, 'P', 'A', ${id('en')}, ${id('q')})
  `;
  await sql`
    INSERT INTO answers (id, answer, question_id, team_id, translation_id)
    VALUES (${id('a')}, 'x', ${id('q')}, ${id('t')}, ${id('tr')})
  `;

  return { eventId, questionId: id('q'), answerId: id('a'), teamId: id('t') };
}

async function state(questionId: string) {
  const [row] = await sql`
    SELECT q.locked, q.graded, a.points_awarded, a.challenged
    FROM questions q JOIN answers a ON a.question_id = q.id WHERE q.id = ${questionId}
  `;
  return { ...row };
}

const untouched = { locked: false, graded: false, points_awarded: null, challenged: false };

afterEach(async () => {
  for (const eventId of events.splice(0)) {
    await sql`DELETE FROM events WHERE id = ${eventId}`;
  }
});

describe.skipIf(!isLocalDatabase())('live run writes', () => {
  test('change the question and answer on their own event', async () => {
    const a = await makeEvent();

    expect(await setQuestionLocked(a.eventId, a.questionId, true)).toBe(true);
    expect(await setQuestionGraded(a.eventId, a.questionId, true)).toBe(true);
    expect(await setAnswerPoints(a.eventId, a.answerId, 3)).toEqual({ question_id: a.questionId, team_id: a.teamId });
    await setAnswerChallenged(a.eventId, a.answerId, true);

    expect(await state(a.questionId)).toEqual({ locked: true, graded: true, points_awarded: 3, challenged: true });
  });

  test("leave another event's question and answer alone", async () => {
    const a = await makeEvent();
    const b = await makeEvent();

    expect(await setQuestionLocked(a.eventId, b.questionId, true)).toBe(false);
    expect(await setQuestionGraded(a.eventId, b.questionId, true)).toBe(false);
    expect(await setAnswerPoints(a.eventId, b.answerId, 3)).toBeNull();
    await setAnswerChallenged(a.eventId, b.answerId, true);

    expect(await state(b.questionId)).toEqual(untouched);
  });
});

describe.skipIf(!isLocalDatabase())('answers in the active item (#54)', () => {
  test('come from the answers table, one entry per team', async () => {
    const a = await makeEvent();
    await setAnswerPoints(a.eventId, a.answerId, 2);

    expect(await getQuestionAnswers(a.eventId, a.questionId)).toEqual({
      [a.teamId]: {
        answerId: a.answerId,
        answerText: 'x',
        languageCode: 'en',
        teamId: a.teamId,
        teamNumber: 1,
        points: 2,
        autoPoints: null,
        challenged: false
      }
    });
  });

  test('are not stored with the run, and are read back from the table', async () => {
    const a = await makeEvent();
    await sql`INSERT INTO runs (event_id) VALUES (${a.eventId})`;

    const item: ActiveItem = {
      type: 'question',
      id: a.questionId,
      number: 1,
      phase: 'answer',
      locked: true,
      graded: false,
      translations: [{ languageCode: 'en', answer: 'A' }],
      answers: {
        stale: {
          answerId: 'stale',
          answerText: 'old copy',
          languageCode: 'en',
          teamId: 'stale',
          teamNumber: 9,
          points: 4,
          autoPoints: null,
          challenged: false
        }
      }
    };

    await saveActiveItem(a.eventId, item);

    const [stored] = await sql`SELECT active_item FROM runs WHERE event_id = ${a.eventId}`;
    expect('answers' in stored.active_item).toBe(false);

    const run = await getRun(a.eventId);
    const answers =
      run?.active_item?.type === 'question' && run.active_item.phase === 'answer' ? run.active_item.answers : null;
    expect(Object.keys(answers ?? {})).toEqual([a.teamId]);
    expect(answers?.[a.teamId]?.answerText).toBe('x');
  });
});
