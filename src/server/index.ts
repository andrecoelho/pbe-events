import './validate-app-data';

import app from '@/frontend/app/app.html';
import login from '@/frontend/login/login.html';
import presenter from '@/frontend/presenter/presenter.html';
import team from '@/frontend/team/team.html';
import { answersRoutes } from '@/server/routes/answers';
import { authRoutes } from '@/server/routes/auth';
import { eventsRoutes } from '@/server/routes/events';
import { languagesRoutes } from '@/server/routes/languages';
import { permissionRoutes } from '@/server/routes/permissions';
import { questionsRoutes } from '@/server/routes/questions';
import { resultsRoutes } from '@/server/routes/results';
import { createRunsRoutes } from '@/server/routes/runs';
import { sessionRoutes } from '@/server/routes/session';
import { slidesRoutes } from '@/server/routes/slides';
import { teamsRoutes } from '@/server/routes/teams';
import { userRoutes } from '@/server/routes/users';
import { getSession } from '@/server/session';
import { apiNotFound, textNotFound } from '@/server/utils/responses';
import { WebSocketServer } from '@/server/webSocket';
import { sql } from 'bun';
import { join } from 'node:path';
import { styleText } from 'node:util';

const appNounce = Bun.randomUUIDv7();
const loginNounce = Bun.randomUUIDv7();
const presenterNounce = Bun.randomUUIDv7();
const teamNounce = Bun.randomUUIDv7();

const wsServer = new WebSocketServer();

const server = Bun.serve({
  routes: {
    [`/${loginNounce}`]: login,
    [`/${appNounce}`]: app,
    [`/${teamNounce}`]: team,
    [`/${presenterNounce}`]: presenter,
    ...authRoutes,
    ...answersRoutes,
    ...sessionRoutes,
    ...eventsRoutes,
    ...permissionRoutes,
    ...teamsRoutes,
    ...languagesRoutes,
    ...userRoutes,
    ...questionsRoutes,
    ...slidesRoutes,
    ...resultsRoutes,
    ...createRunsRoutes(wsServer)
  },
  async fetch(req): Promise<Response | undefined> {
    const url = new URL(req.url);
    const session = await getSession(req);

    if (url.pathname === '/event-run/ws') {
      return wsServer.upgradeWebSocket(req, session);
    }

    if (url.pathname === '/event-run/team') {
      return await fetch(`${server.url}${teamNounce}`);
    }

    if (!session) {
      return await fetch(`${server.url}${loginNounce}`);
    }

    if (url.pathname === '/event-run/presenter') {
      return await fetch(`${server.url}${presenterNounce}`);
    }

    if (url.pathname.startsWith('/api')) {
      return apiNotFound();
    }

    if (url.pathname.startsWith('/user-image')) {
      const userId = url.pathname.split('/')[2];

      if (typeof userId === 'string' && userId.length > 0) {
        const file = Bun.file(join(global.PBE.imageDir, `${userId}`));

        if (await file.exists()) {
          return new Response(file);
        }
      }

      return textNotFound();
    }

    return await fetch(`${server.url}${appNounce}`);
  },
  websocket: wsServer.createHandlers(),
  development: process.env.NODE_ENV !== 'production'
});

// Set WebSocket server reference
wsServer.setServer(server);

console.log(`🚀 Server running at ${styleText('green', server.url.toString())}`);

// Handle graceful shutdown
const shutdown = () => {
  console.log('\n🛑 Shutting down server...');
  sql.end();
  console.log('✅ Database connection closed');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
