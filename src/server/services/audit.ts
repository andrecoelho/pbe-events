// The admin audit log (#61): every action taken from the admin page.
import { sql } from 'bun';

export type AuditAction = 'event.reset' | 'team.release_device';

export interface AuditEntry {
  id: string;
  created_at: Date;
  user_id: string;
  user_email: string;
  action: AuditAction;
  event_id: string | null;
  event_name: string | null;
  details: Record<string, unknown>;
}

export async function logAdminAction(entry: {
  user: { id: string; email: string };
  action: AuditAction;
  event?: { id: string; name: string } | null;
  details?: Record<string, unknown>;
}) {
  await sql`
    INSERT INTO admin_audit_log (id, user_id, user_email, action, event_id, event_name, details)
    VALUES (
      ${Bun.randomUUIDv7()}, ${entry.user.id}, ${entry.user.email}, ${entry.action},
      ${entry.event?.id ?? null}, ${entry.event?.name ?? null}, ${JSON.stringify(entry.details ?? {})}::text::jsonb
    )
  `;
}

// The newest entries, `limit` at a time; pass the last id seen as `before` for the next page.
export async function listAdminActions(limit: number, before?: string): Promise<AuditEntry[]> {
  return before
    ? await sql`SELECT * FROM admin_audit_log WHERE id < ${before} ORDER BY id DESC LIMIT ${limit}`
    : await sql`SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ${limit}`;
}
