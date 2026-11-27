// The admin page's API (Phase 3). Super admins see every event; event admins (owner or admin) see theirs (#89).
import { auth, eventRoleOrSuperAdmin, json, superAdmin } from '@/server/http/middleware';
import { badRequest, notFound, route } from '@/server/http/route';
import { joinEvent, leaveEvent, listAllEvents, transferOwnership } from '@/server/services/adminEvents';
import { listAdminActions, logAdminAction } from '@/server/services/audit';
import { getEventName } from '@/server/services/events';
import { listEventIdsForRoles, listEventPermissions, MANAGER_ROLES } from '@/server/services/permissions';
import { countTeams, getTeam, listTeams } from '@/server/services/teams';
import { findUserByEmail, getUsersByIds } from '@/server/services/users';
import type { Routes } from '@/server/types';
import type { LiveSocket, WebSocketServer } from '@/server/webSocket';
import type {
  ActiveItem,
  AdminEventResponse,
  AdminEventsResponse,
  AuditLogResponse,
  LiveConnection,
  LiveConnectionRole,
  LiveConnectionsResponse
} from '@/types';
import { z } from 'zod';

const EVENTS_PAGE = 50;

const Transfer = z.object({ email: z.string().trim().min(1, 'Enter the new owner’s email.') });

// The event, or a 404.
async function findEvent(id: string) {
  const event = await getEventName(id);

  if (!event) {
    throw notFound('Event not found');
  }

  return event;
}

const ROLE_ORDER: Record<LiveConnection['role'], number> = { host: 0, presenter: 1, judge: 2, results: 3 };

const AUDIT_PAGE = 50;

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
    // The events open in memory, one summary each (#56): all of them for super admins, the ones they manage for
    // everyone else.
    '/api/admin/connections': {
      GET: route(auth(), async ({ user }): Promise<LiveConnectionsResponse> => {
        const managed = user.is_super_admin ? null : await listEventIdsForRoles(user.id, MANAGER_ROLES);
        const events = wsServer.liveEvents().filter((event) => !managed || managed.has(event.eventId));
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
      GET: route(
        eventRoleOrSuperAdmin(...MANAGER_ROLES),
        async ({ params: { id = '' }, user }): Promise<AdminEventResponse> => {
          const event = await findEvent(id);
          const people = await listEventPermissions(id);
          const live = wsServer.liveEvent(id);
          const teamSockets = new Map((live?.sockets ?? []).flatMap((s) => (s.team ? [[s.team.id, s]] : [])));
          const teams = await listTeams(id);

          return {
            serverTime: Date.now(),
            event,
            people: people.map((p) => ({
              userId: p.user_id,
              name: `${p.first_name} ${p.last_name}`.trim(),
              email: p.email,
              role: p.role_id
            })),
            myRole: people.find((p) => p.user_id === user.id)?.role_id ?? null,
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
        }
      )
    },

    // Every event, newest first; ?q= matches its name or its owner's email (#59). Super admins only.
    '/api/admin/events': {
      GET: route(superAdmin(), async ({ req }): Promise<AdminEventsResponse> => {
        const query = new URL(req.url).searchParams.get('q') ?? '';
        const rows = await listAllEvents(query, EVENTS_PAGE + 1);
        const open = new Set(wsServer.liveEvents().map((event) => event.eventId));

        return {
          events: rows.slice(0, EVENTS_PAGE).map((row) => ({
            id: row.id,
            name: row.name,
            createdAt: new Date(row.created_at).toISOString(),
            owner: row.owner_email ? { email: row.owner_email, name: row.owner_name ?? '' } : null,
            peopleCount: row.people_count,
            teamCount: row.team_count,
            questionCount: row.question_count,
            runStatus: row.run_status as AdminEventsResponse['events'][number]['runStatus'],
            live: open.has(row.id)
          })),
          more: rows.length > EVENTS_PAGE
        };
      })
    },

    // Makes another user the owner; the previous owner stays on as an admin (#59).
    '/api/admin/events/:id/transfer': {
      POST: route(superAdmin(), json(Transfer), async ({ params: { id = '' }, body, user }) => {
        const event = await findEvent(id);
        const newOwner = await findUserByEmail(body.email);

        if (!newOwner) {
          throw badRequest('No account uses that email. They need to sign up first.');
        }

        const previousOwnerId = await transferOwnership(id, newOwner.id);
        const previous = previousOwnerId ? (await getUsersByIds([previousOwnerId])).get(previousOwnerId) : undefined;

        await logAdminAction({
          user,
          action: 'event.transfer',
          event,
          target: newOwner,
          details: { previousOwnerEmail: previous?.email ?? null }
        });

        return {};
      })
    },

    // A super admin adds themself to the event as an admin, to help debug it (#59), and leaves again.
    '/api/admin/events/:id/join': {
      POST: route(superAdmin(), async ({ params: { id = '' }, user }) => {
        const event = await findEvent(id);

        if (!(await joinEvent(id, user.id))) {
          throw badRequest('You already have a role on this event.');
        }

        await logAdminAction({ user, action: 'event.join', event });

        return {};
      })
    },

    '/api/admin/events/:id/leave': {
      POST: route(superAdmin(), async ({ params: { id = '' }, user }) => {
        const event = await findEvent(id);

        if (!(await leaveEvent(id, user.id))) {
          throw badRequest(
            'You can only leave an event you’re on as an admin or judge. Transfer it first if you own it.'
          );
        }

        await logAdminAction({ user, action: 'event.leave', event });

        return {};
      })
    },

    // Drops the event's in-memory state and closes its sockets; the pages reconnect and reload it (#57).
    '/api/admin/events/:id/reset': {
      POST: route(eventRoleOrSuperAdmin(...MANAGER_ROLES), async ({ params: { id = '' }, user }) => {
        if (!wsServer.resetEvent(id)) {
          throw badRequest('This event isn’t open in the server’s memory, so there’s nothing to reset.');
        }

        await logAdminAction({ user, action: 'event.reset', event: await getEventName(id) });

        return {};
      })
    },

    // Frees a team for another device, as the host's Release device does (#57).
    '/api/admin/events/:id/teams/:teamId/release': {
      POST: route(eventRoleOrSuperAdmin(...MANAGER_ROLES), async ({ params: { id = '', teamId = '' }, user }) => {
        const team = await getTeam(id, teamId);

        if (!team || !(await wsServer.releaseDevice(id, teamId))) {
          throw notFound('Team not found');
        }

        await logAdminAction({
          user,
          action: 'team.release_device',
          event: await getEventName(id),
          details: { teamId, teamNumber: team.number, teamName: team.name }
        });

        return {};
      })
    },

    // The audit log (#61), newest first, a page at a time. Super admins only.
    '/api/admin/audit-log': {
      GET: route(superAdmin(), async ({ req }): Promise<AuditLogResponse> => {
        const before = new URL(req.url).searchParams.get('before') ?? undefined;
        const rows = await listAdminActions(AUDIT_PAGE + 1, before);
        const entries = rows.slice(0, AUDIT_PAGE);

        return {
          entries: entries.map((row) => ({
            id: row.id,
            createdAt: new Date(row.created_at).toISOString(),
            userId: row.user_id,
            userEmail: row.user_email,
            action: row.action,
            eventId: row.event_id,
            eventName: row.event_name,
            details: row.details
          })),
          nextBefore: rows.length > AUDIT_PAGE ? entries.at(-1)!.id : null
        };
      })
    }
  };
}
