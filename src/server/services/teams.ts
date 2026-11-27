import { sql } from 'bun';

export interface Team {
  id: string;
  name: string;
  number: number;
  event_id: string;
  language_id: string;
  language_name: string | null;
  language_code: string | null;
  join_code: string;
  // Whether a device has joined the team (the token itself never leaves the database).
  has_device: boolean;
  created_at: Date;
}

const TEAM_COLUMNS = sql`
  t.id, t.name, t.number, t.event_id, t.language_id, l.name AS language_name, l.code AS language_code,
  t.join_code, t.device_token_hash IS NOT NULL AS has_device, t.created_at
`;

export async function listTeams(eventId: string): Promise<Team[]> {
  return await sql`
    SELECT ${TEAM_COLUMNS}
    FROM teams t
    LEFT JOIN languages l ON l.id = t.language_id
    WHERE t.event_id = ${eventId}
    ORDER BY t.number
  `;
}

// The team, only if it belongs to the event.
export async function getTeam(eventId: string, teamId: string): Promise<Team | null> {
  const rows: Team[] = await sql`
    SELECT ${TEAM_COLUMNS}
    FROM teams t
    LEFT JOIN languages l ON l.id = t.language_id
    WHERE t.id = ${teamId} AND t.event_id = ${eventId}
  `;

  return rows[0] ?? null;
}

// The id of the event's team with this name, if any.
export async function findTeamByName(eventId: string, name: string) {
  const rows: { id: string }[] = await sql`SELECT id FROM teams WHERE event_id = ${eventId} AND name = ${name}`;

  return rows[0]?.id ?? null;
}

// Adds the team with the next number.
export async function addTeam(eventId: string, name: string, languageId: string) {
  const id = Bun.randomUUIDv7();
  const rows: { number: number; join_code: string }[] = await sql`
    INSERT INTO teams (id, event_id, name, number, language_id)
    VALUES (${id}, ${eventId}, ${name},
      (SELECT COALESCE(MAX(number), 0) + 1 FROM teams WHERE event_id = ${eventId}), ${languageId})
    RETURNING number, join_code
  `;

  return { id, number: rows[0]!.number, joinCode: rows[0]!.join_code };
}

// Only touches the team if it belongs to the event.
export async function updateTeam(
  eventId: string,
  teamId: string,
  team: { name: string; number: number; languageId: string }
) {
  await sql`
    UPDATE teams SET name = ${team.name}, number = ${team.number}, language_id = ${team.languageId}
    WHERE id = ${teamId} AND event_id = ${eventId}
  `;
}

// Deletes the team and closes the gap in the numbering. Returns false if the event has no such team.
export async function deleteTeam(eventId: string, teamId: string) {
  return await sql.begin(async (tx) => {
    const rows: { number: number }[] = await tx`
      DELETE FROM teams WHERE id = ${teamId} AND event_id = ${eventId} RETURNING number
    `;
    const deleted = rows[0];

    if (!deleted) {
      return false;
    }

    await tx`UPDATE teams SET number = number - 1 WHERE event_id = ${eventId} AND number > ${deleted.number}`;

    return true;
  });
}

// Device tokens (#44): the device that joins a team gets a random token in this cookie, and the database
// keeps only its SHA-256.
export const TEAM_TOKEN_COOKIE = 'teamToken';

export function newDeviceToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

export function hashDeviceToken(token: string) {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}

// The team with this join code (already normalized), with its event's name and the device token hash.
export async function getTeamByJoinCode(code: string) {
  const rows: (Team & { event_name: string; device_token_hash: string | null })[] = await sql`
    SELECT ${TEAM_COLUMNS}, t.device_token_hash, e.name AS event_name
    FROM teams t
    JOIN events e ON e.id = t.event_id
    LEFT JOIN languages l ON l.id = t.language_id
    WHERE t.join_code = ${code}
  `;

  return rows[0] ?? null;
}

// The team whose device holds this token, or null when no team does (never joined, or released).
export async function getTeamByDeviceToken(token: string) {
  const rows: Team[] = await sql`
    SELECT ${TEAM_COLUMNS}
    FROM teams t
    LEFT JOIN languages l ON l.id = t.language_id
    WHERE t.device_token_hash = ${hashDeviceToken(token)}
  `;

  return rows[0] ?? null;
}

// Gives the team to the device holding this token, only if no device holds it yet. Returns whether it did.
export async function claimTeamDevice(teamId: string, token: string) {
  const rows = await sql`
    UPDATE teams SET device_token_hash = ${hashDeviceToken(token)}
    WHERE id = ${teamId} AND device_token_hash IS NULL
    RETURNING id
  `;

  return rows.length > 0;
}

// Frees the team for another device. Returns false when the event has no such team.
export async function releaseTeamDevice(eventId: string, teamId: string) {
  const rows = await sql`
    UPDATE teams SET device_token_hash = NULL WHERE id = ${teamId} AND event_id = ${eventId} RETURNING id
  `;

  return rows.length > 0;
}

// Gives the team a new join code, so the old code and link stop working; the device that joined keeps the
// team. Returns the new code, or null when the event has no such team.
export async function renewJoinCode(eventId: string, teamId: string) {
  const rows: { join_code: string }[] = await sql`
    UPDATE teams SET join_code = new_join_code() WHERE id = ${teamId} AND event_id = ${eventId} RETURNING join_code
  `;

  return rows[0]?.join_code ?? null;
}

// How many teams each event has (the admin page's open events, #56).
export async function countTeams(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  const rows: { event_id: string; count: number }[] = await sql`
    SELECT event_id, count(*)::int AS count FROM teams WHERE event_id IN ${sql(eventIds)} GROUP BY event_id
  `;

  return new Map(rows.map((row) => [row.event_id, row.count]));
}
