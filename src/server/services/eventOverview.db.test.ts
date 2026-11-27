// The event home page's counts (#69) against a real database. Runs only when POSTGRES_URL is a local dev
// database (`mise run db`); CI has none, so it skips there.
import { getEventCounts } from '@/server/services/eventOverview';
import { addTeam, claimTeamDevice, newDeviceToken } from '@/server/services/teams';
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

async function makeEvent() {
  const eventId = `test-overview-${Bun.randomUUIDv7()}`;
  events.push(eventId);
  await sql`INSERT INTO events (id, name) VALUES (${eventId}, 'Overview test')`;

  return eventId;
}

async function addLanguage(eventId: string, code: string) {
  const id = `${eventId}-${code}`;
  await sql`INSERT INTO languages (id, code, name, event_id) VALUES (${id}, ${code}, ${code}, ${eventId})`;

  return id;
}

async function addQuestion(eventId: string, number: number, languageIds: string[]) {
  const id = `${eventId}-q${number}`;
  await sql`
    INSERT INTO questions (id, number, type, max_points, seconds, event_id)
    VALUES (${id}, ${number}, 'PS', 1, 30, ${eventId})
  `;

  for (const languageId of languageIds) {
    await sql`
      INSERT INTO translations (id, prompt, answer, language_id, question_id)
      VALUES (${`${id}-${languageId}`}, 'Prompt', 'Answer', ${languageId}, ${id})
    `;
  }
}

afterEach(async () => {
  for (const eventId of events.splice(0)) {
    await sql`DELETE FROM events WHERE id = ${eventId}`;
  }
});

describe.skipIf(!isLocalDatabase())('getEventCounts', () => {
  test('an empty event has nothing and has not started', async () => {
    const eventId = await makeEvent();

    expect(await getEventCounts(eventId)).toEqual({
      languages: 0,
      questions: 0,
      questions_missing_translations: 0,
      teams: 0,
      teams_joined: 0,
      slides: 0,
      judges: 0,
      run_status: 'not_started'
    });
  });

  test('counts questions missing a translation in any language, and teams that joined', async () => {
    const eventId = await makeEvent();
    const en = await addLanguage(eventId, 'en');
    const es = await addLanguage(eventId, 'es');

    await addQuestion(eventId, 1, [en, es]);
    await addQuestion(eventId, 2, [en]);
    await addQuestion(eventId, 3, []);

    const eagles = await addTeam(eventId, 'Eagles', en);
    await addTeam(eventId, 'Lions', es);
    await claimTeamDevice(eagles.id, newDeviceToken());

    const counts = await getEventCounts(eventId);

    expect(counts.languages).toBe(2);
    expect(counts.questions).toBe(3);
    expect(counts.questions_missing_translations).toBe(2);
    expect(counts.teams).toBe(2);
    expect(counts.teams_joined).toBe(1);
  });
});
