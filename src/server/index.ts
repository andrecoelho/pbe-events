import type { BunRequest } from 'bun';
import { join } from 'path';

import app from '@/frontend/app/app.html';
import login from '@/frontend/login/login.html';
import { authRoutes } from '@/server/routes/auth';
import { eventsRoutes } from '@/server/routes/events';
import { getSession } from '@/server/session';
import { apiNotFound, textNotFound } from '@/server/utils/responses';

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

    if (url.pathname.startsWith('/api')) {
      return apiNotFound();
    }

    if (url.pathname.startsWith('/user-image')) {
      const userId = url.pathname.split('/')[2];

      if (typeof userId === 'string' && userId.length > 0) {
        const path = join(import.meta.dir, '../../data/', `${session.user_id}.png`);
        const file = Bun.file(path);

        if (await file.exists()) {
          return new Response(file);
        }
      }

      return textNotFound();
    }

    return await fetch(`${server.url}${appNounce}`);
  },
  routes: {
    [`/${loginNounce}`]: login,
    [`/${appNounce}`]: app,
    ...authRoutes,
    ...eventsRoutes
  },
  development: process.env.NODE_ENV !== 'production',
  port: 3000
});

console.log(`🚀 Server running at ${server.url}`);
