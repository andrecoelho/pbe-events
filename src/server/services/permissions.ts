// Who can do what on an event. Every permission check (REST, WebSocket, admin) goes through here.
import { sql } from 'bun';

export type Role = 'owner' | 'admin' | 'judge';

// Running, editing and managing an event.
export const MANAGER_ROLES: Role[] = ['owner', 'admin'];
// Everyone with a role, including judges.
export const ALL_ROLES: Role[] = ['owner', 'admin', 'judge'];

export interface EventWithRole {
  id: string;
  name: string;
  title_remarks: string | null;
  role_id: Role;
}

export interface EventPermission {
  user_id: string;
  role_id: Role;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

// The event and the user's role on it, or null when the user has no role there.
export async function getEventRole(eventId: string, userId: string): Promise<EventWithRole | null> {
  const rows: EventWithRole[] = await sql`
    SELECT events.id, events.name, events.title_remarks, permissions.role_id
    FROM events
    JOIN permissions ON events.id = permissions.event_id
    WHERE permissions.user_id = ${userId} AND events.id = ${eventId}
  `;

  return rows[0] ?? null;
}

// The event, if the user has one of `roles` on it; otherwise null.
export async function getEventForRoles(eventId: string, userId: string, roles: readonly Role[]) {
  const event = await getEventRole(eventId, userId);

  return event && roles.includes(event.role_id) ? event : null;
}

export async function listEventPermissions(eventId: string): Promise<EventPermission[]> {
  return await sql`
    SELECT permissions.user_id, permissions.role_id, users.email, users.first_name, users.last_name, users.avatar_url
    FROM permissions
    JOIN users ON permissions.user_id = users.id
    WHERE permissions.event_id = ${eventId}
    ORDER BY CASE permissions.role_id WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      users.first_name, users.last_name, users.email
  `;
}

export async function addPermission(eventId: string, userId: string, roleId: Role) {
  await sql`INSERT INTO permissions (user_id, event_id, role_id) VALUES (${userId}, ${eventId}, ${roleId})`;
}

export async function updatePermission(eventId: string, userId: string, roleId: Role) {
  await sql`UPDATE permissions SET role_id = ${roleId} WHERE user_id = ${userId} AND event_id = ${eventId}`;
}

export async function removePermission(eventId: string, userId: string) {
  await sql`DELETE FROM permissions WHERE user_id = ${userId} AND event_id = ${eventId}`;
}

// The ids of the events where the user has one of `roles` (the admin page's list for event admins, #89).
export async function listEventIdsForRoles(userId: string, roles: readonly Role[]): Promise<Set<string>> {
  const rows: { event_id: string }[] = await sql`
    SELECT event_id FROM permissions WHERE user_id = ${userId} AND role_id IN ${sql(roles as Role[])}
  `;

  return new Set(rows.map((row) => row.event_id));
}

// Whether the user has one of `roles` on any event.
export async function hasAnyEventRole(userId: string, roles: readonly Role[]) {
  const rows = await sql`
    SELECT 1 FROM permissions WHERE user_id = ${userId} AND role_id IN ${sql(roles as Role[])} LIMIT 1
  `;

  return rows.length > 0;
}

// Why a role change from the Permissions page isn't allowed, or null when it is (#90). `current` is the person's
// role on the event (null: none); `next` the role asked for (null: remove them). The owner only changes with
// Transfer ownership on the admin page, so an event always keeps exactly one owner.
export function roleChangeError(current: Role | null, next: Role | null): string | null {
  if (next === 'owner') {
    return 'An event has one owner. A super admin can transfer ownership from the admin page.';
  }

  if (current === 'owner') {
    return 'The owner’s role can’t be changed or removed. A super admin can transfer ownership first.';
  }

  return null;
}
