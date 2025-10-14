import app from '@/frontend/app/app.html';
import login from '@/frontend/login/login.html';
import { authRoutes } from '@/server/routes/auth';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';

const appNounce = Bun.randomUUIDv7();
const loginNounce = Bun.randomUUIDv7();

const server = Bun.serve({
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname in authRoutes) {
      return authRoutes[url.pathname]![req.method]!(req as BunRequest);
    }

    const session = getSession(req);

    if (!session) {
      return await fetch(`${server.url}${loginNounce}`);
    }

    return await fetch(`${server.url}${appNounce}`);
  },
  routes: {
    [`/${loginNounce}`]: login,
    [`/${appNounce}`]: app,
    ...authRoutes
  },
  development: process.env.NODE_ENV !== 'production',
  port: 3000
});

console.log(`🚀 Server running at ${server.url}`);
