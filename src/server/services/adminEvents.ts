// Event management on the admin page (#59): every event, ownership transfers, and super admins joining an event.
import { sql } from 'bun';

export interface AdminEventRow {
  id: string;
  name: string;
  created_at: Date;
  owner_email: string | null;
  owner_name: string | null;
  people_count: number;
  team_count: number;
  question_count: number;
  run_status: string | null;
}

// Events whose name or owner's email contains `query` (all when it's empty), newest first, at most `limit`.
export async function listAllEvents(query: string, limit: number): Promise<AdminEventRow[]> {
  const pattern = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  return await sql`
    SELECT e.id, e.name, e.created_at,
      o.email AS owner_email, trim(o.first_name || ' ' || o.last_name) AS owner_name,
      (SELECT count(*)::int FROM permissions p WHERE p.event_id = e.id) AS people_count,
      (SELECT count(*)::int FROM teams t WHERE t.event_id = e.id) AS team_count,
      (SELECT count(*)::int FROM questions q WHERE q.event_id = e.id) AS question_count,
      r.status AS run_status
    FROM events e
    LEFT JOIN permissions op ON op.event_id = e.id AND op.role_id = 'owner'
    LEFT JOIN users o ON o.id = op.user_id
    LEFT JOIN runs r ON r.event_id = e.id
    WHERE e.name ILIKE ${pattern} OR o.email ILIKE ${pattern}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `;
}

// Makes the user the event's owner. The previous owner stays on as an admin. Returns the previous owner's id.
export async function transferOwnership(eventId: string, newOwnerId: string): Promise<string | null> {
  return await sql.begin(async (tx) => {
    const previous: { user_id: string }[] = await tx`
      UPDATE permissions SET role_id = 'admin'
      WHERE event_id = ${eventId} AND role_id = 'owner' AND user_id != ${newOwnerId}
      RETURNING user_id
    `;

    await tx`
      INSERT INTO permissions (user_id, event_id, role_id) VALUES (${newOwnerId}, ${eventId}, 'owner')
      ON CONFLICT (user_id, event_id) DO UPDATE SET role_id = 'owner'
    `;

    return previous[0]?.user_id ?? null;
  });
}

// Adds the user to the event as an admin, unless they already have a role there. True when added.
export async function joinEvent(eventId: string, userId: string) {
  const rows = await sql`
    INSERT INTO permissions (user_id, event_id, role_id) VALUES (${userId}, ${eventId}, 'admin')
    ON CONFLICT (user_id, event_id) DO NOTHING
    RETURNING user_id
  `;

  return rows.length > 0;
}

// Removes the user's role on the event, unless they own it. True when removed.
export async function leaveEvent(eventId: string, userId: string) {
  const rows = await sql`
    DELETE FROM permissions WHERE event_id = ${eventId} AND user_id = ${userId} AND role_id != 'owner'
    RETURNING user_id
  `;

  return rows.length > 0;
}
