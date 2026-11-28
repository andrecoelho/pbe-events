// What events have so far, for the event home page (#69) and the event list's hint (#71).
import type { EventCounts, RunStatus } from '@/types';
import { sql } from 'bun';

export interface EventCountsWithStatus {
  counts: EventCounts;
  runStatus: RunStatus;
}

interface Row {
  id: string;
  languages: number;
  questions: number;
  questions_missing_translations: number;
  teams: number;
  teams_joined: number;
  slides: number;
  judges: number;
  run_status: RunStatus;
}

// Each event's counts and run status, by event id. Events that don't exist are left out.
export async function getEventCountsFor(eventIds: string[]): Promise<Map<string, EventCountsWithStatus>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  const rows: Row[] = await sql`
    SELECT
      e.id,
      (SELECT count(*)::int FROM languages WHERE event_id = e.id) AS languages,
      (SELECT count(*)::int FROM questions WHERE event_id = e.id) AS questions,
      (
        SELECT count(*)::int FROM questions q
        WHERE q.event_id = e.id
          AND EXISTS (
            SELECT 1 FROM languages l
            WHERE l.event_id = q.event_id
              AND NOT EXISTS (SELECT 1 FROM translations t WHERE t.question_id = q.id AND t.language_id = l.id)
          )
      ) AS questions_missing_translations,
      (SELECT count(*)::int FROM teams WHERE event_id = e.id) AS teams,
      (SELECT count(*)::int FROM teams WHERE event_id = e.id AND device_token_hash IS NOT NULL) AS teams_joined,
      (SELECT count(*)::int FROM slides WHERE event_id = e.id) AS slides,
      (SELECT count(*)::int FROM permissions WHERE event_id = e.id AND role_id = 'judge') AS judges,
      coalesce((SELECT status FROM runs WHERE event_id = e.id), 'not_started') AS run_status
    FROM events e
    WHERE e.id IN ${sql(eventIds)}
  `;

  return new Map(
    rows.map((row) => [
      row.id,
      {
        counts: {
          languages: row.languages,
          questions: row.questions,
          questionsMissingTranslations: row.questions_missing_translations,
          teams: row.teams,
          teamsJoined: row.teams_joined,
          slides: row.slides,
          judges: row.judges
        },
        runStatus: row.run_status
      }
    ])
  );
}

export async function getEventCounts(eventId: string): Promise<EventCountsWithStatus> {
  const counts = (await getEventCountsFor([eventId])).get(eventId);

  if (!counts) {
    throw new Error(`Event ${eventId} not found`);
  }

  return counts;
}
