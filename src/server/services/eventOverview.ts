// What an event has so far, for its home page (#69): what's ready, what's missing.
import type { RunStatus } from '@/types';
import { sql } from 'bun';

export interface EventCounts {
  languages: number;
  questions: number;
  // Questions without a translation in at least one of the event's languages.
  questions_missing_translations: number;
  teams: number;
  // Teams whose device has joined with the join code.
  teams_joined: number;
  slides: number;
  judges: number;
  run_status: RunStatus;
}

export async function getEventCounts(eventId: string): Promise<EventCounts> {
  const rows: EventCounts[] = await sql`
    SELECT
      (SELECT count(*)::int FROM languages WHERE event_id = ${eventId}) AS languages,
      (SELECT count(*)::int FROM questions WHERE event_id = ${eventId}) AS questions,
      (
        SELECT count(*)::int FROM questions q
        WHERE q.event_id = ${eventId}
          AND EXISTS (
            SELECT 1 FROM languages l
            WHERE l.event_id = q.event_id
              AND NOT EXISTS (SELECT 1 FROM translations t WHERE t.question_id = q.id AND t.language_id = l.id)
          )
      ) AS questions_missing_translations,
      (SELECT count(*)::int FROM teams WHERE event_id = ${eventId}) AS teams,
      (SELECT count(*)::int FROM teams WHERE event_id = ${eventId} AND device_token_hash IS NOT NULL) AS teams_joined,
      (SELECT count(*)::int FROM slides WHERE event_id = ${eventId}) AS slides,
      (SELECT count(*)::int FROM permissions WHERE event_id = ${eventId} AND role_id = 'judge') AS judges,
      coalesce((SELECT status FROM runs WHERE event_id = ${eventId}), 'not_started') AS run_status
  `;

  return rows[0]!;
}
