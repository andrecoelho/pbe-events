import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import {
  formatAgo,
  formatDuration,
  ROLE_BADGES,
  ROLE_LABELS,
  RUN_STATUS,
  TEAM_STATUS
} from '@/frontend/app/pages/admin/adminFormat';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import { useEffect } from 'react';
import { useSnapshot } from 'valtio';

// /admin/events/:id
const eventIdFromUrl = () => window.location.pathname.match(/^\/admin\/events\/([^/]+)/)?.[1] ?? '';

function EventPage() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.event);
  const eventId = eventIdFromUrl();

  useEffect(() => valt.poll(() => valt.loadEvent(eventId)), [valt, eventId]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  if (!snap.data) {
    return (
      <div className='flex flex-col gap-4 max-w-6xl'>
        <a className='link link-hover text-sm' href='/admin'>
          ← Live connections
        </a>
        <div role='alert' className='alert alert-error'>
          {snap.error}
        </div>
      </div>
    );
  }

  const { event, live, teams, serverTime } = snap.data;
  const connectedTeams = teams.filter((team) => team.status === 'connected').length;

  return (
    <div className='flex flex-col gap-6 max-w-6xl'>
      <div className='flex flex-col gap-2'>
        <a className='link link-hover text-sm' href='/admin'>
          ← Live connections
        </a>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-bold'>{event.name}</h2>
          {live && <span className={`badge ${RUN_STATUS[live.runStatus][1]}`}>{RUN_STATUS[live.runStatus][0]}</span>}
          {live?.activeItem && <span className='text-base-content/70'>{live.activeItem}</span>}
          <span className='flex-1' />
          <a className='btn btn-sm' href={`/run/${event.id}`}>
            Open the Run screen
          </a>
        </div>
      </div>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t refresh this event. {snap.error}
        </div>
      )}

      {!live && (
        <div role='status' className='alert'>
          This event isn’t open in the server’s memory: none of its screens are open right now.
        </div>
      )}

      <section className='flex flex-col gap-2'>
        <h3 className='text-lg font-semibold'>People</h3>
        {live && live.connections.length > 0 ? (
          <div className='overflow-x-auto'>
            <table className='table table-sm'>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Who</th>
                  <th>Connected for</th>
                  <th>Last message</th>
                </tr>
              </thead>
              <tbody>
                {live.connections.map((c, index) => (
                  <tr key={`${c.role}:${c.userId}:${index}`}>
                    <td>
                      <span className={`badge badge-sm ${ROLE_BADGES[c.role]}`}>{ROLE_LABELS[c.role][0]}</span>
                    </td>
                    <td>
                      {c.name} <span className='text-base-content/60'>{c.email}</span>
                    </td>
                    <td>{formatDuration(serverTime - c.connectedAt)}</td>
                    <td>{formatAgo(serverTime, c.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='text-base-content/60'>No host, presenter, judge or results screen is connected.</p>
        )}
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-lg font-semibold'>
          Teams{' '}
          <span className='text-base-content/60 font-normal'>
            {connectedTeams} of {teams.length} connected
          </span>
        </h3>
        {teams.length > 0 ? (
          <div className='overflow-x-auto'>
            <table className='table table-sm'>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>Language</th>
                  <th>Connection</th>
                  <th>Device</th>
                  <th>Connected for</th>
                  <th>Last message</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const [statusLabel, statusClass] = TEAM_STATUS[team.status];

                  return (
                    <tr key={team.id}>
                      <td>{team.number}</td>
                      <td>{team.name}</td>
                      <td>{team.languageCode?.toUpperCase() ?? '—'}</td>
                      <td className='whitespace-nowrap'>
                        <span className={`status ${statusClass} mr-2`} />
                        {statusLabel}
                        {team.status !== 'connected' && team.lastSeenAt !== null && (
                          <span className='text-base-content/60'> · seen {formatAgo(serverTime, team.lastSeenAt)}</span>
                        )}
                      </td>
                      <td>{team.hasDevice ? 'Joined' : <span className='text-base-content/60'>No device</span>}</td>
                      <td>{team.connectedAt === null ? '—' : formatDuration(serverTime - team.connectedAt)}</td>
                      <td>{team.status === 'connected' ? formatAgo(serverTime, team.lastMessageAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='text-base-content/60'>This event has no teams.</p>
        )}
      </section>
    </div>
  );
}

export function AdminEvent() {
  return (
    <AdminLayout tab='connections'>
      <EventPage />
    </AdminLayout>
  );
}

AdminEvent.displayName = 'AdminEvent';
