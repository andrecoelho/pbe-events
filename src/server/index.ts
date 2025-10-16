import { join } from 'path';

import app from '@/frontend/app/app.html';
import login from '@/frontend/login/login.html';
import { authRoutes } from '@/server/routes/auth';
import { eventsRoutes } from '@/server/routes/events';
import { sessionRoutes } from '@/server/routes/session';
import { getSession } from '@/server/session';
import { apiNotFound, textNotFound } from '@/server/utils/responses';

const appNounce = Bun.randomUUIDv7();
const loginNounce = Bun.randomUUIDv7();

const server = Bun.serve({
  routes: {
    [`/${loginNounce}`]: login,
    [`/${appNounce}`]: app,
    ...authRoutes,
    ...sessionRoutes,
    ...eventsRoutes
  },
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
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
  development: process.env.NODE_ENV !== 'production',
});

console.log(`🚀 Server running at ${server.url}`);
