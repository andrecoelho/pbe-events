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
