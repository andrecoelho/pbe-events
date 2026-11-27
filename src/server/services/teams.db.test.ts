// Team join codes and device tokens (#44) against a real database. Runs only when POSTGRES_URL is a local dev
// database (`mise run db`); CI has none, so it skips there.
import {
  addTeam,
  claimTeamDevice,
  getTeam,
  getTeamByDeviceToken,
  getTeamByJoinCode,
  newDeviceToken,
  releaseTeamDevice,
  renewJoinCode
} from '@/server/services/teams';
import { normalizeJoinCode } from '@/joinCode';
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

async function makeTeam() {
  const eventId = `test-join-${Bun.randomUUIDv7()}`;
  events.push(eventId);

  await sql`INSERT INTO events (id, name) VALUES (${eventId}, 'Join test')`;
  await sql`INSERT INTO languages (id, code, name, event_id) VALUES (${`${eventId}-en`}, 'en', 'English', ${eventId})`;

  const team = await addTeam(eventId, 'Eagles', `${eventId}-en`);

  return { eventId, ...team };
}

afterEach(async () => {
  for (const eventId of events.splice(0)) {
    await sql`DELETE FROM events WHERE id = ${eventId}`;
  }
});

describe.skipIf(!isLocalDatabase())('team join codes', () => {
  test('every new team gets a valid, distinct code', async () => {
    const a = await makeTeam();
    const b = await makeTeam();

    expect(normalizeJoinCode(a.joinCode)).toBe(a.joinCode);
    expect(a.joinCode).not.toBe(b.joinCode);
    expect((await getTeamByJoinCode(a.joinCode))?.id).toBe(a.id);
  });

  test('one device holds a team until it is released', async () => {
    const { eventId, id } = await makeTeam();
    const first = newDeviceToken();
    const second = newDeviceToken();

    expect(await getTeamByDeviceToken(first)).toBeNull();
    expect(await claimTeamDevice(id, first)).toBe(true);
    expect(await claimTeamDevice(id, second)).toBe(false);
    expect((await getTeamByDeviceToken(first))?.id).toBe(id);
    expect((await getTeam(eventId, id))?.has_device).toBe(true);

    // Another event can't release it.
    expect(await releaseTeamDevice('another-event', id)).toBe(false);
    expect((await getTeamByDeviceToken(first))?.id).toBe(id);

    expect(await releaseTeamDevice(eventId, id)).toBe(true);
    expect(await getTeamByDeviceToken(first)).toBeNull();
    expect(await claimTeamDevice(id, second)).toBe(true);
  });

  test('a new code replaces the old one and keeps the device', async () => {
    const { eventId, id, joinCode } = await makeTeam();
    const token = newDeviceToken();
    await claimTeamDevice(id, token);

    expect(await renewJoinCode('another-event', id)).toBeNull();

    const renewed = await renewJoinCode(eventId, id);

    expect(renewed).not.toBe(joinCode);
    expect(await getTeamByJoinCode(joinCode)).toBeNull();
    expect((await getTeamByJoinCode(renewed!))?.id).toBe(id);
    expect((await getTeamByDeviceToken(token))?.id).toBe(id);
  });

  test('the database keeps only a hash of the token', async () => {
    const { id } = await makeTeam();
    const token = newDeviceToken();
    await claimTeamDevice(id, token);

    const [row] = await sql`SELECT device_token_hash FROM teams WHERE id = ${id}`;

    expect(row.device_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.device_token_hash).not.toContain(token);
  });
});
