// replaceQuestions against a real database. Runs only when POSTGRES_URL is a local dev database
// (`mise run db`); CI has none, so it skips there. Each test builds its own throwaway event.
import { HttpError } from '@/server/http/route';
import type { LanguageDefinition, QuestionImport } from '@/server/questionsFile';
import { replaceQuestions } from '@/server/services/questions';
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

const english = { code: 'en', name: 'English' };
const spanish = { code: 'es', name: 'Spanish' };

function questionsIn(languages: LanguageDefinition[]): QuestionImport[] {
  return [
    {
      type: 'PG',
      maxPoints: 2,
      seconds: 30,
      translations: languages.map((language) => ({ lang: language.code, prompt: `Q (${language.code})`, answer: 'A' }))
    }
  ];
}

const events: string[] = [];

// An event with English and Spanish, one team on each, and one question.
async function makeEvent() {
  const eventId = `test-import-${Bun.randomUUIDv7()}`;
  events.push(eventId);

  await sql`INSERT INTO events (id, name) VALUES (${eventId}, 'Import test')`;
  await replaceQuestions(eventId, [english, spanish], questionsIn([english, spanish]));

  const languages: { id: string; code: string }[] = await sql`
    SELECT id, code FROM languages WHERE event_id = ${eventId}
  `;
  const id = (code: string) => languages.find((language) => language.code === code)!.id;

  await sql`
    INSERT INTO teams (id, number, name, event_id, language_id) VALUES
      (${`${eventId}-t1`}, 1, 'Team En', ${eventId}, ${id('en')}),
      (${`${eventId}-t2`}, 2, 'Team Es', ${eventId}, ${id('es')})
  `;

  return { eventId, enId: id('en'), esId: id('es') };
}

async function teamLanguages(eventId: string) {
  const rows: { name: string; code: string; language_id: string }[] = await sql`
    SELECT t.name, l.code, t.language_id FROM teams t JOIN languages l ON l.id = t.language_id
    WHERE t.event_id = ${eventId} ORDER BY t.number
  `;
  return rows.map((row) => ({ ...row }));
}

async function addAnswer(eventId: string) {
  const [translation]: { id: string; question_id: string }[] = await sql`
    SELECT t.id, t.question_id FROM translations t JOIN questions q ON q.id = t.question_id
    WHERE q.event_id = ${eventId} LIMIT 1
  `;
  await sql`
    INSERT INTO answers (id, answer, question_id, team_id, translation_id)
    VALUES (${Bun.randomUUIDv7()}, 'A', ${translation!.question_id}, ${`${eventId}-t1`}, ${translation!.id})
  `;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the import to be refused');
}

afterEach(async () => {
  for (const eventId of events.splice(0)) {
    await sql`DELETE FROM events WHERE id = ${eventId}`;
  }
});

describe.skipIf(!isLocalDatabase())('replaceQuestions with teams', () => {
  test('re-importing the same languages keeps the teams on them and takes the new names', async () => {
    const { eventId, enId, esId } = await makeEvent();
    const espanol = { code: 'es', name: 'Español' };

    await replaceQuestions(eventId, [english, espanol], questionsIn([english, espanol]));

    expect(await teamLanguages(eventId)).toEqual([
      { name: 'Team En', code: 'en', language_id: enId },
      { name: 'Team Es', code: 'es', language_id: esId }
    ]);
    const [es]: { name: string }[] = await sql`SELECT name FROM languages WHERE id = ${esId}`;
    expect(es!.name).toBe('Español');
  });

  test('adds languages that are new in the file', async () => {
    const { eventId } = await makeEvent();
    const french = { code: 'fr', name: 'French' };

    await replaceQuestions(eventId, [english, spanish, french], questionsIn([english, spanish, french]));

    const codes: { code: string }[] = await sql`SELECT code FROM languages WHERE event_id = ${eventId} ORDER BY code`;
    expect(codes.map((row) => row.code)).toEqual(['en', 'es', 'fr']);
  });

  test('refuses to drop a language teams use, and changes nothing', async () => {
    const { eventId } = await makeEvent();
    const before = await teamLanguages(eventId);

    const error = await rejection(replaceQuestions(eventId, [english], questionsIn([english])));

    expect(error.status).toBe(409);
    expect(error.details).toMatchObject({
      missingLanguages: [{ code: 'es', name: 'Spanish', teamCount: 1 }],
      answerCount: 0,
      fileLanguages: [english]
    });
    expect(await teamLanguages(eventId)).toEqual(before);
    const translations: { count: number }[] = await sql`
      SELECT COUNT(*)::int AS count FROM translations t JOIN questions q ON q.id = t.question_id WHERE q.event_id = ${eventId}
    `;
    expect(translations[0]!.count).toBe(2);
  });

  test('moves the teams to teamLanguage and deletes the dropped language', async () => {
    const { eventId, enId } = await makeEvent();

    await replaceQuestions(eventId, [english], questionsIn([english]), { teamLanguage: 'en' });

    expect(await teamLanguages(eventId)).toEqual([
      { name: 'Team En', code: 'en', language_id: enId },
      { name: 'Team Es', code: 'en', language_id: enId }
    ]);
    const codes: { code: string }[] = await sql`SELECT code FROM languages WHERE event_id = ${eventId}`;
    expect(codes.map((row) => row.code)).toEqual(['en']);
  });

  test('drops a language no team uses without asking', async () => {
    const { eventId, esId } = await makeEvent();
    await sql`UPDATE teams SET language_id = (SELECT id FROM languages WHERE event_id = ${eventId} AND code = 'en') WHERE language_id = ${esId}`;

    await replaceQuestions(eventId, [english], questionsIn([english]));

    const codes: { code: string }[] = await sql`SELECT code FROM languages WHERE event_id = ${eventId}`;
    expect(codes.map((row) => row.code)).toEqual(['en']);
  });

  test('rejects a teamLanguage that is not in the file', async () => {
    const { eventId } = await makeEvent();

    const error = await rejection(replaceQuestions(eventId, [english], questionsIn([english]), { teamLanguage: 'de' }));

    expect(error.status).toBe(400);
  });

  test('refuses to erase recorded answers unless deleteAnswers is set', async () => {
    const { eventId } = await makeEvent();
    await addAnswer(eventId);

    const error = await rejection(replaceQuestions(eventId, [english, spanish], questionsIn([english, spanish])));
    expect(error.status).toBe(409);
    expect(error.details).toMatchObject({ missingLanguages: [], answerCount: 1 });

    await replaceQuestions(eventId, [english, spanish], questionsIn([english, spanish]), { deleteAnswers: true });
    const answers: { count: number }[] = await sql`
      SELECT COUNT(*)::int AS count FROM answers a JOIN teams t ON t.id = a.team_id WHERE t.event_id = ${eventId}
    `;
    expect(answers[0]!.count).toBe(0);
  });

  test('reports both conflicts at once', async () => {
    const { eventId } = await makeEvent();
    await addAnswer(eventId);

    const error = await rejection(replaceQuestions(eventId, [english], questionsIn([english])));

    expect(error.details).toMatchObject({ missingLanguages: [{ code: 'es', teamCount: 1 }], answerCount: 1 });
  });
});
