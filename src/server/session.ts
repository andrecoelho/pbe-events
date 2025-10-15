import { db } from '@/server/db';
import type { Session } from '@/server/types';
import type { BunRequest } from 'bun';

const queryInsertSession = db.query<{}, { $sessionId: string; $userId: string }>(
  'INSERT INTO sessions (id, user_id) VALUES ($sessionId, $userId)'
);

const querySelectSession = db.query<Session, { $sessionId: string }>('SELECT * FROM sessions WHERE id = $sessionId');
const queryDeleteSession = db.query<{}, { $sessionId: string }>('DELETE FROM sessions WHERE id = $sessionId');

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

export function createSession(userId: string) {
  const sessionId = Bun.randomUUIDv7();

  queryInsertSession.run({ $sessionId: sessionId, $userId: userId });

  return sessionId;
}

export function getSession(req: Request) {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return null;
  }

  return querySelectSession.get({ $sessionId: sessionId });
}

export function deleteSession(req: BunRequest) {
  const sessionId = getSessionIdFromCookies(req);

  if (!sessionId) {
    return;
  }

  queryDeleteSession.run({ $sessionId: sessionId });
}
