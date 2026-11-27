// The admin page's API (Phase 3). Super admins only.
import { superAdmin } from '@/server/http/middleware';
import { route } from '@/server/http/route';
import { getUsersByIds } from '@/server/services/users';
import type { Routes } from '@/server/types';
import type { WebSocketServer } from '@/server/webSocket';
import type { ActiveItem, LiveConnection, LiveConnectionsResponse } from '@/types';

const ROLE_ORDER: Record<LiveConnection['role'], number> = { host: 0, presenter: 1, judge: 2, results: 3, team: 4 };

// A short label for what the event shows right now.
export function describeActiveItem(item: ActiveItem | null) {
  if (!item) {
    return null;
  }

  switch (item.type) {
    case 'title':
      return 'Title';
    case 'slide':
      return `Slide ${item.number}`;
    case 'question':
      if (item.phase === 'reading') {
        return `Question ${item.number} · reading`;
      }

      if (item.phase === 'answer') {
        return `Question ${item.number} · answer shown`;
      }

      return `Question ${item.number} · ${item.graded ? 'graded' : item.locked ? 'locked' : item.isTimeUp ? 'time up' : 'answering'}`;
  }
}

export function createAdminRoutes(wsServer: WebSocketServer): Routes {
  return {
    // The events open in memory and who is connected to each (#56).
    '/api/admin/connections': {
      GET: route(superAdmin(), async (): Promise<LiveConnectionsResponse> => {
        const events = wsServer.liveEvents();
        const userIds = [...new Set(events.flatMap((event) => event.sockets.flatMap((s) => s.userId ?? [])))];
        const users = await getUsersByIds(userIds);

        return {
          serverTime: Date.now(),
          events: events
            .map((event) => ({
              eventId: event.eventId,
              eventName: event.eventName,
              runStatus: event.runStatus,
              activeItem: describeActiveItem(event.activeItem),
              connections: event.sockets
                .map((socket): LiveConnection => {
                  const user = socket.userId ? users.get(socket.userId) : undefined;

                  return {
                    role: socket.role,
                    name: socket.team
                      ? socket.team.name
                      : user
                        ? `${user.first_name} ${user.last_name}`.trim() || user.email
                        : 'Deleted user',
                    detail: socket.team ? `Team ${socket.team.number}` : (user?.email ?? ''),
                    userId: socket.userId,
                    teamId: socket.team?.id ?? null,
                    connectedAt: socket.connectedAt,
                    lastMessageAt: socket.lastMessageAt
                  };
                })
                .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
            }))
            .sort((a, b) => a.eventName.localeCompare(b.eventName))
        };
      })
    }
  };
}
