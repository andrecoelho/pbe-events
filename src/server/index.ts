import login from '@/frontend/login/login.html';
import { authRoutes } from '@/server/routes/auth';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';

const loginNounce = Bun.randomUUIDv7();

const server = Bun.serve({
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);

    console.log('URL', url);

    if (url.pathname in authRoutes) {
      console.log('HANDLING AUTH ROUTE', url.pathname, req.method);
      return authRoutes[url.pathname]![req.method]!(req as BunRequest);
    }

    const session = getSession(req);

    if (!session) {
      return await fetch(`${server.url}/${loginNounce}`);
    }

    return new Response('Hello, World!');
  },
  routes: {
    [`/${loginNounce}`]: login,
    ...authRoutes
  },
  development: process.env.NODE_ENV !== 'production',
  port: 3000
});

console.log(`🚀 Server running at ${server.url}`);
