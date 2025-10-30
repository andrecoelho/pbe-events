import './validate-app-data';

import app from '@/frontend/app/app.html';
import login from '@/frontend/login/login.html';
import { db } from '@/server/db';
import { authRoutes } from '@/server/routes/auth';
import { eventsRoutes } from '@/server/routes/events';
import { permissionRoutes } from '@/server/routes/permissions';
import { questionsRoutes } from '@/server/routes/questions';
import { sessionRoutes } from '@/server/routes/session';
import { teamsRoutes } from '@/server/routes/teams';
import { userRoutes } from '@/server/routes/users';
import { getSession } from '@/server/session';
import { apiNotFound, textNotFound } from '@/server/utils/responses';
import { join, resolve } from 'node:path';
import { styleText } from 'node:util';

const mountPath = process.env.PBE_APP_DATA_PATH!;
const dataDir = resolve(mountPath);
const imageDir = join(dataDir, 'user-image');

const appNounce = Bun.randomUUIDv7();
const loginNounce = Bun.randomUUIDv7();

const server = Bun.serve({
  routes: {
    [`/${loginNounce}`]: login,
    [`/${appNounce}`]: app,
    ...authRoutes,
    ...sessionRoutes,
    ...eventsRoutes,
    ...permissionRoutes,
    ...teamsRoutes,
    ...userRoutes,
    ...questionsRoutes
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
        const file = Bun.file(join(imageDir, `${userId}.png`));

        if (await file.exists()) {
          return new Response(file);
        }
      }

      return textNotFound();
    }

    return await fetch(`${server.url}${appNounce}`);
  },
  development: process.env.NODE_ENV !== 'production'
});

console.log(`🚀 Server running at ${styleText('green', server.url.toString())}`);

// Handle graceful shutdown
const shutdown = () => {
  console.log('\n🛑 Shutting down server...');
  db.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
