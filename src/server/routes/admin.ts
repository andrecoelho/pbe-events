// The admin page's API (Phase 3). Super admins only.
import { superAdmin } from '@/server/http/middleware';
import { badRequest, notFound, route } from '@/server/http/route';
import { getEventName } from '@/server/services/events';
import { countTeams, listTeams } from '@/server/services/teams';
import { getUsersByIds } from '@/server/services/users';
import type { Routes } from '@/server/types';
import type { LiveSocket, WebSocketServer } from '@/server/webSocket';
import type {
  ActiveItem,
  AdminEventResponse,
  LiveConnection,
  LiveConnectionRole,
  LiveConnectionsResponse
} from '@/types';

const ROLE_ORDER: Record<LiveConnection['role'], number> = { host: 0, presenter: 1, judge: 2, results: 3 };

const latest = (times: (number | null)[]) =>
  times.reduce<number | null>((max, t) => (t !== null && (max === null || t > max) ? t : max), null);

// The signed-in people's sockets, named, hosts first.
async function namedConnections(sockets: LiveSocket[]): Promise<LiveConnection[]> {
  const people = sockets.filter((s) => s.role !== 'team' && s.userId);
  const users = await getUsersByIds([...new Set(people.map((s) => s.userId!))]);

  return people
    .map((socket): LiveConnection => {
      const user = users.get(socket.userId!);

      return {
        role: socket.role as LiveConnection['role'],
        name: user ? `${user.first_name} ${user.last_name}`.trim() || user.email : 'Deleted user',
        email: user?.email ?? '',
        userId: socket.userId!,
        connectedAt: socket.connectedAt,
        lastMessageAt: socket.lastMessageAt
      };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

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
    // The events open in memory, one summary each (#56).
    '/api/admin/connections': {
      GET: route(superAdmin(), async (): Promise<LiveConnectionsResponse> => {
        const events = wsServer.liveEvents();
        const teamCounts = await countTeams(events.map((event) => event.eventId));

        return {
          serverTime: Date.now(),
          events: events
            .map((event) => {
              const counts: Record<LiveConnectionRole, number> = {
                host: 0,
                presenter: 0,
                judge: 0,
                results: 0,
                team: 0
              };

              event.sockets.forEach((socket) => counts[socket.role]++);

              return {
                eventId: event.eventId,
                eventName: event.eventName,
                runStatus: event.runStatus,
                activeItem: describeActiveItem(event.activeItem),
                counts,
                teamCount: teamCounts.get(event.eventId) ?? 0,
                teamsReconnecting: wsServer.teamsReconnecting(event.eventId),
                lastMessageAt: latest(event.sockets.map((socket) => socket.lastMessageAt))
              };
            })
            .sort((a, b) => a.eventName.localeCompare(b.eventName))
        };
      })
    },

    // One event: who is connected, and every team with its connection (#56). Works for events that aren't open.
    '/api/admin/events/:id': {
      GET: route(superAdmin(), async ({ params: { id = '' } }): Promise<AdminEventResponse> => {
        const event = await getEventName(id);

        if (!event) {
          throw notFound('Event not found');
        }

        const live = wsServer.liveEvent(id);
        const teamSockets = new Map((live?.sockets ?? []).flatMap((s) => (s.team ? [[s.team.id, s]] : [])));
        const teams = await listTeams(id);

        return {
          serverTime: Date.now(),
          event,
          live: live && {
            runStatus: live.runStatus,
            activeItem: describeActiveItem(live.activeItem),
            connections: await namedConnections(live.sockets)
          },
          teams: teams.map((team) => {
            const socket = teamSockets.get(team.id);

            return {
              id: team.id,
              number: team.number,
              name: team.name,
              languageCode: team.language_code,
              hasDevice: team.has_device,
              ...wsServer.teamConnection(id, team.id),
              connectedAt: socket?.connectedAt ?? null,
              lastMessageAt: socket?.lastMessageAt ?? null
            };
          })
        };
      })
    },

    // Drops the event's in-memory state and closes its sockets; the pages reconnect and reload it (#57).
    '/api/admin/events/:id/reset': {
      POST: route(superAdmin(), async ({ params: { id = '' }, user }) => {
        if (!wsServer.resetEvent(id)) {
          throw badRequest('This event isn’t open in the server’s memory, so there’s nothing to reset.');
        }

        // Until the audit log (#61).
        console.log(`Admin ${user.email} reset event ${id} in memory`);

        return {};
      })
    },

    // Frees a team for another device, as the host's Release device does (#57).
    '/api/admin/events/:id/teams/:teamId/release': {
      POST: route(superAdmin(), async ({ params: { id = '', teamId = '' }, user }) => {
        if (!(await wsServer.releaseDevice(id, teamId))) {
          throw notFound('Team not found');
        }

        console.log(`Admin ${user.email} released the device of team ${teamId} in event ${id}`);

        return {};
      })
    }
  };
}
