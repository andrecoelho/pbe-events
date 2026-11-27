import { describe, expect, mock, test } from 'bun:test';
import type { BunRequest, Server } from 'bun';
import { z } from 'zod';

// No database in tests: the session and permission lookups are stubbed.
const users: Record<string, { id: string; is_super_admin: boolean }> = {
  'session-alice': { id: 'alice', is_super_admin: false },
  'session-root': { id: 'root', is_super_admin: true }
};
const roles: Record<string, string> = { 'event-1:alice': 'admin', 'event-2:alice': 'judge' };

mock.module('@/server/session', () => ({
  getSessionUser: async (req: Request) => {
    const sessionId = req.headers.get('Cookie')?.replace('sessionId=', '') ?? '';
    const user = users[sessionId];
    return user ? { session: { id: sessionId, user_id: user.id }, user } : null;
  }
}));

mock.module('@/server/services/permissions', () => ({
  getEventRole: async (eventId: string, userId: string) => {
    const role = roles[`${eventId}:${userId}`];
    return role ? { id: eventId, name: `Event ${eventId}`, title_remarks: null, role_id: role } : null;
  }
}));

const { route, notFound } = await import('@/server/http/route');
const { auth, eventRole, json, rateLimit, superAdmin } = await import('@/server/http/middleware');

const server = { requestIP: () => ({ address: '10.0.0.1', family: 'IPv4', port: 1 }) } as unknown as Server<unknown>;

function request(
  options: { session?: string; params?: Record<string, string>; body?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.session) headers.Cookie = `sessionId=${options.session}`;

  const req = new Request('http://localhost/api/test', {
    method: options.body === undefined ? 'GET' : 'POST',
    headers,
    body: options.body
  }) as BunRequest<string>;

  return Object.assign(req, { params: options.params ?? {} });
}

async function call(handler: ReturnType<typeof route>, options?: Parameters<typeof request>[0]) {
  const res = await handler(request(options), server);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

describe('route', () => {
  test('sends a returned object as camelCased JSON', async () => {
    const res = await call(route(() => ({ event_id: 'e1' })));
    expect(res).toMatchObject({ status: 200, body: { eventId: 'e1' } });
  });

  test('passes a returned Response through', async () => {
    const res = await route(() => new Response('hi', { status: 201 }))(request(), server);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('hi');
  });

  test('runs middlewares in order around the handler', async () => {
    const order: string[] = [];
    const step = (name: string) => async (_ctx: unknown, next: () => Promise<Response>) => {
      order.push(`${name} in`);
      const res = await next();
      order.push(`${name} out`);
      return res;
    };

    await call(
      route(step('a'), step('b'), () => {
        order.push('handler');
        return {};
      })
    );

    expect(order).toEqual(['a in', 'b in', 'handler', 'b out', 'a out']);
  });

  test('answers a thrown HttpError with its status and message', async () => {
    const res = await call(
      route(() => {
        throw notFound('No such team');
      })
    );
    expect(res).toMatchObject({ status: 404, body: { error: 'No such team' } });
  });

  test('answers anything else with a 500 and a request id, and logs it', async () => {
    const logged = mock();
    const original = console.error;
    console.error = logged;

    try {
      const res = await call(
        route(() => {
          throw new Error('db down');
        })
      );
      expect(res.status).toBe(500);
      expect(res.body.requestId).toBeString();
      expect(res.body.error).not.toContain('db down');
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      console.error = original;
    }
  });
});

describe('auth', () => {
  test('401 without a session', async () => {
    const res = await call(route(auth(), () => ({})));
    expect(res.status).toBe(401);
  });

  test('adds the user', async () => {
    const res = await call(
      route(auth(), ({ user }) => ({ userId: user.id })),
      { session: 'session-alice' }
    );
    expect(res.body).toEqual({ userId: 'alice' });
  });
});

describe('superAdmin', () => {
  test('403 for a regular user, allowed for a super admin', async () => {
    const handler = route(superAdmin(), () => ({ ok: true }));
    expect((await call(handler, { session: 'session-alice' })).status).toBe(403);
    expect((await call(handler, { session: 'session-root' })).status).toBe(200);
  });
});

describe('eventRole', () => {
  const handler = route(eventRole('owner', 'admin'), ({ event }) => ({ role: event.role_id }));

  test('adds the event when the user has one of the roles', async () => {
    const res = await call(handler, { session: 'session-alice', params: { id: 'event-1' } });
    expect(res).toMatchObject({ status: 200, body: { role: 'admin' } });
  });

  test('reads :eventId too', async () => {
    const res = await call(handler, { session: 'session-alice', params: { eventId: 'event-1' } });
    expect(res.status).toBe(200);
  });

  test('403 for another role or no role', async () => {
    expect((await call(handler, { session: 'session-alice', params: { id: 'event-2' } })).status).toBe(403);
    expect((await call(handler, { session: 'session-alice', params: { id: 'event-9' } })).status).toBe(403);
  });

  test('401 before checking the role', async () => {
    expect((await call(handler, { params: { id: 'event-1' } })).status).toBe(401);
  });

  test('takes the event id from a custom source', async () => {
    const custom = route(eventRole('judge', { eventId: () => 'event-2' }), ({ event }) => ({ id: event.id }));
    const res = await call(custom, { session: 'session-alice' });
    expect(res.body).toEqual({ id: 'event-2' });
  });
});

describe('json', () => {
  const Rename = z.object({ name: z.string().trim().min(1, 'Enter a name') });
  const handler = route(json(Rename), ({ body }) => ({ name: body.name }));

  test('adds the parsed body', async () => {
    const res = await call(handler, { body: JSON.stringify({ name: '  Finals ' }) });
    expect(res.body).toEqual({ name: 'Finals' });
  });

  test('400 with the field problems', async () => {
    const res = await call(handler, { body: JSON.stringify({ name: ' ' }) });
    expect(res).toMatchObject({
      status: 400,
      body: { error: 'Enter a name', fields: { name: ['Enter a name'] } }
    });
  });

  test('400 for a body that is not JSON', async () => {
    const res = await call(handler, { body: 'nope' });
    expect(res).toMatchObject({ status: 400, body: { error: 'The request body must be JSON.' } });
  });
});

describe('rateLimit', () => {
  test('429 with Retry-After once the limit is used up, per client', async () => {
    const handler = route(rateLimit({ limit: 2, windowMs: 60_000 }), () => ({}));

    expect((await call(handler)).status).toBe(200);
    expect((await call(handler)).status).toBe(200);

    const limited = await call(handler);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');

    expect((await call(handler, { headers: { 'X-Real-IP': '10.0.0.2' } })).status).toBe(200);
  });

  test('starts a new window once the old one ends', async () => {
    const handler = route(rateLimit({ limit: 1, windowMs: 20 }), () => ({}));

    expect((await call(handler)).status).toBe(200);
    expect((await call(handler)).status).toBe(429);
    await Bun.sleep(25);
    expect((await call(handler)).status).toBe(200);
  });
});

describe('types', () => {
  test('the handler context is typed from the middlewares', () => {
    route(eventRole('owner'), json(z.object({ n: z.number() })), ({ event, user, body }) => {
      const id: string = event.id;
      const admin: boolean = user.is_super_admin;
      const n: number = body.n;
      return { id, admin, n };
    });

    // @ts-expect-error: `user` needs auth(), eventRole() or superAdmin()
    route(({ user }) => ({ id: user.id }));
  });
});
