import './validate-app-data';

import app from '@/frontend/app/app.html';
import login from '@/frontend/login/login.html';
import { authRoutes } from '@/server/routes/auth';
import { eventsRoutes } from '@/server/routes/events';
import { languagesRoutes } from '@/server/routes/languages';
import { permissionRoutes } from '@/server/routes/permissions';
import { questionsRoutes } from '@/server/routes/questions';
import { sessionRoutes } from '@/server/routes/session';
import { teamsRoutes } from '@/server/routes/teams';
import { userRoutes } from '@/server/routes/users';
import { getSession } from '@/server/session';
import type { Session } from '@/server/types';
import { apiNotFound, badRequest, textNotFound } from '@/server/utils/responses';
import { sql, type ServerWebSocket } from 'bun';
import { join } from 'node:path';
import { styleText } from 'node:util';

interface WebsocketData {
  session: Session | null;
  eventId: string | null;
  teamId: string | null;
  role: 'host' | 'team';
}

interface EventConnection {
  host: Set<ServerWebSocket<WebsocketData>>;
  teams: Map<string, ServerWebSocket<WebsocketData>>;
}

const appNounce = Bun.randomUUIDv7();
const loginNounce = Bun.randomUUIDv7();
const eventConnections = new Map<string, EventConnection>();

const server = Bun.serve({
  routes: {
    [`/${loginNounce}`]: login,
    [`/${appNounce}`]: app,
    ...authRoutes,
    ...sessionRoutes,
    ...eventsRoutes,
    ...permissionRoutes,
    ...teamsRoutes,
    ...languagesRoutes,
    ...userRoutes,
    ...questionsRoutes
  },
  async fetch(req): Promise<Response | undefined> {
    const url = new URL(req.url);
    const session = await getSession(req);

    if (url.pathname === '/event-run/ws') {
      const eventId = url.searchParams.get('eventId');
      const teamId = url.searchParams.get('teamId');
      const role = session ? 'host' : 'team';

      if (!eventId || !teamId) {
        return badRequest('Missing eventId or teamId');
      }

      const upgraded = server.upgrade(req, {
        data: {
          session,
          eventId,
          teamId,
          role
        }
      });

      if (upgraded) {
        return;
      }

      return badRequest('WebSocket upgrade failed');
    }

    if (!session) {
      return await fetch(`${server.url}${loginNounce}`);
    }

    if (url.pathname.startsWith('/api')) {
      return apiNotFound();
    }

    if (url.pathname.startsWith('/user-image')) {
      const userId = url.pathname.split('/')[2];

      if (typeof userId === 'string' && userId.length > 0) {
        const file = Bun.file(join(global.PBE.imageDir, `${userId}.png`));

        if (await file.exists()) {
          return new Response(file);
        }
      }

      return textNotFound();
    }

    return await fetch(`${server.url}${appNounce}`);
  },
  websocket: {
    data: {} as WebsocketData,
    open(ws) {
      console.log('WebSocket connection opened', ws);
    },
    close(ws, code, reason) {
      console.log(`WebSocket connection closed: ${code} - ${reason}`, ws);
    },
    message(ws, message) {
      console.log('WebSocket message received:', ws, message);
      ws.send(`Echo: ${message}`);
    }
  },
  development: process.env.NODE_ENV !== 'production'
});

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
