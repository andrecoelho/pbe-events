import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { formatAgo, ROLE_LABELS, RUN_STATUS } from '@/frontend/app/pages/admin/adminFormat';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import type { LiveEventSummary } from '@/types';
import { useEffect } from 'react';
import { useSnapshot } from 'valtio';

const openEvent = (eventId: string) => {
  const href = `/admin/events/${eventId}`;

  if (window.navigation) {
    window.navigation.navigate(href);
  } else {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};

const PEOPLE = ['host', 'presenter', 'judge', 'results'] as const;

const isRunning = (event: LiveEventSummary) => event.runStatus === 'in_progress' || event.runStatus === 'paused';

// "1 host · 2 judges", with a warning when a running event has no host.
function People({ event }: { event: LiveEventSummary }) {
  const counts = PEOPLE.filter((role) => event.counts[role] > 0).map(
    (role) => `${event.counts[role]} ${ROLE_LABELS[role][event.counts[role] === 1 ? 0 : 1]}`
  );

  return (
    <span className='flex flex-wrap items-center gap-2'>
      {event.counts.host === 0 && isRunning(event) && <span className='badge badge-sm badge-warning'>No host</span>}
      <span>{counts.join(' · ') || <span className='text-base-content/60'>None</span>}</span>
    </span>
  );
}

// "2 / 3", flagging teams missing while the run is going and teams reconnecting.
function Teams({ event }: { event: LiveEventSummary }) {
  const missing = event.teamCount - event.counts.team - event.teamsReconnecting;

  return (
    <span className='flex flex-wrap items-center gap-2'>
      <span>
        {event.counts.team} / {event.teamCount}
      </span>
      {event.teamsReconnecting > 0 && (
        <span className='badge badge-sm badge-warning'>{event.teamsReconnecting} reconnecting</span>
      )}
      {missing > 0 && isRunning(event) && <span className='badge badge-sm badge-warning'>{missing} not connected</span>}
    </span>
  );
}

function ConnectionsList() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.connections);

  useEffect(() => valt.poll(valt.loadConnections), [valt]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  const events = snap.data?.events ?? [];
  const serverTime = snap.data?.serverTime ?? 0;

  return (
    <div className='flex flex-col gap-4 max-w-6xl'>
      <p className='text-base-content/70'>
        Events open in the server’s memory: one appears when someone opens its run, presenter, judge, results or team
        screen, and goes away when the last one closes. Open an event to see who is connected. Refreshes every 5
        seconds.
      </p>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t refresh the connections. {snap.error}
        </div>
      )}

      {snap.data && events.length === 0 && (
        <p className='text-lg text-base-content/60'>No events are open right now.</p>
      )}

      {events.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='table'>
            <thead>
              <tr>
                <th>Event</th>
                <th>Run</th>
                <th>On screen</th>
                <th>People</th>
                <th>Teams connected</th>
                <th>Last message</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const [statusLabel, statusBadge] = RUN_STATUS[event.runStatus];

                return (
                  <tr
                    key={event.eventId}
                    className='hover:bg-base-200 cursor-pointer'
                    onClick={() => openEvent(event.eventId)}
                  >
                    <td>
                      <a
                        className='link link-hover font-semibold'
                        href={`/admin/events/${event.eventId}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.eventName}
                      </a>
                    </td>
                    <td>
                      <span className={`badge badge-sm whitespace-nowrap ${statusBadge}`}>{statusLabel}</span>
                    </td>
                    <td>{event.activeItem ?? <span className='text-base-content/60'>Nothing yet</span>}</td>
                    <td>
                      <People event={event} />
                    </td>
                    <td>
                      <Teams event={event} />
                    </td>
                    <td className='whitespace-nowrap'>{formatAgo(serverTime, event.lastMessageAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LiveConnections() {
  return (
    <AdminLayout tab='connections'>
      <ConnectionsList />
    </AdminLayout>
  );
}

LiveConnections.displayName = 'LiveConnections';
