// An event's run: status, grace period and the item on screen.
import type { ActiveItem } from '@/types';
import { withAnswers } from '@/server/services/answers';
import { sql } from 'bun';

export type RunStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';

export interface Run {
  event_id: string;
  event_name: string;
  title_remarks: string | null;
  status: RunStatus;
  grace_period: number;
  active_item: ActiveItem | null;
}

export async function getRun(eventId: string): Promise<Run | null> {
  const rows: Run[] = await sql`
    SELECT runs.event_id, events.name AS event_name, events.title_remarks, runs.status, runs.grace_period,
      runs.active_item
    FROM runs
    JOIN events ON events.id = runs.event_id
    WHERE runs.event_id = ${eventId}
  `;

  const run = rows[0];

  if (!run) {
    return null;
  }

  // Answers aren't stored in the active item (#54): they come from the answers table.
  return { ...run, active_item: await withAnswers(eventId, run.active_item) };
}

// Saves the item on screen without its answers, which live in the answers table (#54).
export async function saveActiveItem(eventId: string, activeItem: ActiveItem | null) {
  const stored = activeItem && 'answers' in activeItem ? { ...activeItem, answers: undefined } : activeItem;

  await sql`UPDATE runs SET active_item = ${stored}::jsonb WHERE event_id = ${eventId}`;
}

// Back to `not_started` also erases every answer and unlocks every question, all or nothing.
export async function setRunStatus(eventId: string, status: RunStatus) {
  if (status !== 'not_started') {
    await sql`UPDATE runs SET status = ${status} WHERE event_id = ${eventId}`;
    return;
  }

  await sql.begin(async (tx) => {
    await tx`DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE event_id = ${eventId})`;
    await tx`UPDATE questions SET locked = false, graded = false WHERE event_id = ${eventId}`;
    await tx`UPDATE runs SET status = ${status} WHERE event_id = ${eventId}`;
  });
}

export async function setGracePeriod(eventId: string, gracePeriod: number) {
  await sql`UPDATE runs SET grace_period = ${gracePeriod} WHERE event_id = ${eventId}`;
}
