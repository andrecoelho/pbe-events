import { sql } from 'bun';
import type { PBEEvent } from '@/server/types';

export async function querySelectEvent(eventId: string, userId: string): Promise<PBEEvent | null> {
  const result: PBEEvent[] = await sql`
    SELECT events.name
    FROM events
    JOIN permissions ON events.id = permissions.event_id
    WHERE permissions.user_id = ${userId} AND events.id = ${eventId} AND permissions.role_id IN ('owner', 'admin')
  `;
  return result[0] || null;
}
