import { sql } from 'bun';
import type { Session } from '@/server/types';
import type { BunRequest } from 'bun';

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

  await sql`INSERT INTO sessions (id, user_id) VALUES (${sessionId}, ${userId})`;

  return sessionId;
}

export async function getSession(req: Request) {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return null;
  }

  const result: Session[] = await sql`SELECT * FROM sessions WHERE id = ${sessionId}`;

  console.log(sessionId, result);

  return result[0] || null;
}

export async function deleteSession(req: BunRequest) {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return;
  }

  await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
}
