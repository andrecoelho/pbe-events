import { db } from '@/server/db';
import type { PBEEvent } from '@/server/types';

export const querySelectEvent = db.query<PBEEvent, { $eventId: string; $userId: string }>(
  `SELECT events.name
   FROM events
   JOIN permissions ON events.id = permissions.eventId
   WHERE permissions.userId = $userId AND events.id = $eventId AND permissions.roleId IN ('owner', 'admin')`
);
