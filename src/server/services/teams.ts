import { sql } from 'bun';

export interface Team {
  id: string;
  name: string;
  number: number;
  event_id: string;
  language_id: string;
  language_name: string | null;
  language_code: string | null;
  created_at: Date;
}

export async function listTeams(eventId: string): Promise<Team[]> {
  return await sql`
    SELECT t.id, t.name, t.number, t.event_id, t.language_id, l.name AS language_name, l.code AS language_code,
      t.created_at
    FROM teams t
    LEFT JOIN languages l ON l.id = t.language_id
    WHERE t.event_id = ${eventId}
    ORDER BY t.number
  `;
}

// The team, only if it belongs to the event.
export async function getTeam(eventId: string, teamId: string): Promise<Team | null> {
  const rows: Team[] = await sql`
    SELECT t.id, t.name, t.number, t.event_id, t.language_id, l.name AS language_name, l.code AS language_code,
      t.created_at
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
  const rows: { number: number }[] = await sql`
    INSERT INTO teams (id, event_id, name, number, language_id)
    VALUES (${id}, ${eventId}, ${name},
      (SELECT COALESCE(MAX(number), 0) + 1 FROM teams WHERE event_id = ${eventId}), ${languageId})
    RETURNING number
  `;

  return { id, number: rows[0]!.number };
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
