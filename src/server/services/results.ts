import { sql } from 'bun';

// The most points a team can score in the event.
export async function getMaxPoints(eventId: string) {
  const rows: { total: number }[] = await sql`
    SELECT COALESCE(SUM(max_points), 0) AS total FROM questions WHERE event_id = ${eventId}
  `;

  return rows[0]?.total || 0;
}

// Each team's total, counting a judge's points over the automatic ones.
export async function getTeamScores(eventId: string) {
  const rows: {
    id: string;
    number: number;
    name: string;
    language_id: string;
    language_name: string;
    total_points: number;
  }[] = await sql`
    SELECT
      t.id,
      t.number,
      t.name,
      t.language_id,
      l.name AS language_name,
      COALESCE(SUM(COALESCE(a.points_awarded, a.auto_points_awarded, 0)), 0) AS total_points
    FROM teams t
    LEFT JOIN languages l ON l.id = t.language_id
    LEFT JOIN answers a ON a.team_id = t.id
    LEFT JOIN questions q ON q.id = a.question_id AND q.event_id = ${eventId}
    WHERE t.event_id = ${eventId}
    GROUP BY t.id, t.number, t.name, t.language_id, l.name
    ORDER BY t.number ASC
  `;

  return rows;
}

// Every answer with its points, for the CSV export.
export async function getAnswerExport(eventId: string) {
  const rows: {
    question_number: number;
    team_number: number;
    team_name: string;
    language_name: string;
    answer: string;
    points: number;
  }[] = await sql`
    SELECT
      q.number AS question_number,
      t.number AS team_number,
      t.name AS team_name,
      l.name AS language_name,
      a.answer,
      COALESCE(a.points_awarded, a.auto_points_awarded, 0) AS points
    FROM answers a
    JOIN questions q ON q.id = a.question_id
    JOIN teams t ON t.id = a.team_id
    LEFT JOIN languages l ON l.id = t.language_id
    WHERE q.event_id = ${eventId}
    ORDER BY q.number, t.number
  `;

  return rows;
}
