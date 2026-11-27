import { sql } from 'bun';
import type { Session } from '@/server/types';
import type { BunRequest } from 'bun';

// A session lasts this long after its last use. It's renewed at most once a day, so most
// requests only read it.
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  is_super_admin: boolean;
}

export function getSessionIdFromCookies(req: Request) {
  const cookies = req.headers.get('Cookie');

  if (!cookies) {
    return null;
  }

  const sessionId = cookies
    .split(';')
    .find((cookie) => cookie.trim().startsWith('sessionId='))
    ?.split('=')[1];

  return sessionId ?? null;
}

export async function createSession(userId: string) {
  const sessionId = Bun.randomUUIDv7();

  await sql`DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP`;
  await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${userId}, CURRENT_TIMESTAMP + make_interval(days => ${SESSION_DAYS}))
  `;

  return sessionId;
}

async function renewSession(session: { id: string; expires_at: Date }) {
  const renewAfter = Date.now() + (SESSION_DAYS - 1) * 24 * 60 * 60 * 1000;

  if (new Date(session.expires_at).getTime() < renewAfter) {
    await sql`
      UPDATE sessions SET expires_at = CURRENT_TIMESTAMP + make_interval(days => ${SESSION_DAYS})
      WHERE id = ${session.id}
    `;
  }
}

export async function getSession(req: Request) {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return null;
  }

  const result: Session[] = await sql`
    SELECT * FROM sessions WHERE id = ${sessionId} AND expires_at > CURRENT_TIMESTAMP
  `;
  const session = result[0];

  if (!session) {
    return null;
  }

  await renewSession(session);

  return session;
}

// The session and its user in one query, for route()'s auth().
export async function getSessionUser(req: Request): Promise<{ session: Session; user: SessionUser } | null> {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return null;
  }

  const rows: (SessionUser & { session_id: string; created_at: Date; expires_at: Date })[] = await sql`
    SELECT sessions.id AS session_id, sessions.created_at, sessions.expires_at,
      users.id, users.email, users.first_name, users.last_name, users.avatar_url, users.is_super_admin
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ${sessionId} AND sessions.expires_at > CURRENT_TIMESTAMP
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const { session_id, created_at, expires_at, ...user } = row;
  const session: Session = { id: session_id, user_id: user.id, created_at, expires_at };

  await renewSession(session);

  return { session, user };
}

export async function deleteSession(req: BunRequest) {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return;
  }

  await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
}
