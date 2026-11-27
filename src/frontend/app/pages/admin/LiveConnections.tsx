import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import type { LiveConnectionRole, RunStatus } from '@/types';
import { useEffect } from 'react';
import { useSnapshot } from 'valtio';

const ROLE_LABELS: Record<LiveConnectionRole, [singular: string, plural: string]> = {
  host: ['host', 'hosts'],
  presenter: ['presenter', 'presenters'],
  judge: ['judge', 'judges'],
  results: ['results screen', 'results screens'],
  team: ['team', 'teams']
};

const ROLE_BADGES: Record<LiveConnectionRole, string> = {
  host: 'badge-primary',
  presenter: 'badge-secondary',
  judge: 'badge-accent',
  results: 'badge-info',
  team: 'badge-neutral'
};

const RUN_STATUS: Record<RunStatus, [label: string, badge: string]> = {
  not_started: ['Not started', 'badge-ghost'],
  in_progress: ['In progress', 'badge-success'],
  paused: ['Paused', 'badge-warning'],
  completed: ['Completed', 'badge-neutral']
};

// "12 s", "4 min", "2 h 5 min".
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));

  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

// "1 host · 2 judges · 5 teams".
function summarize(event: { readonly connections: readonly { readonly role: LiveConnectionRole }[] }) {
  const counts = new Map<LiveConnectionRole, number>();

  event.connections.forEach((c) => counts.set(c.role, (counts.get(c.role) ?? 0) + 1));

  return (Object.keys(ROLE_LABELS) as LiveConnectionRole[])
    .filter((role) => counts.has(role))
    .map((role) => {
      const count = counts.get(role)!;
      return `${count} ${ROLE_LABELS[role][count === 1 ? 0 : 1]}`;
    })
    .join(' · ');
}

export function LiveConnections() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.connections);

  useEffect(() => valt.watchConnections(), [valt]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  return (
    <div className='flex flex-col gap-6 max-w-5xl'>
      <p className='text-base-content/70'>
        Events open in the server’s memory: one appears when someone opens its run, presenter, judge, results or team
        screen, and goes away when the last one closes. Refreshes every 5 seconds.
      </p>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t refresh the connections. {snap.error}
        </div>
      )}

      {snap.events.length === 0 && <p className='text-lg text-base-content/60'>No events are open right now.</p>}

      {snap.events.map((event) => {
        const [statusLabel, statusBadge] = RUN_STATUS[event.runStatus];

        return (
          <section key={event.eventId} className='card bg-base-100 shadow-sm'>
            <div className='card-body'>
              <div className='flex flex-wrap items-center gap-3'>
                <h2 className='card-title'>
                  <a className='link link-hover' href={`/run/${event.eventId}`}>
                    {event.eventName}
                  </a>
                </h2>
                <span className={`badge ${statusBadge}`}>{statusLabel}</span>
                {event.activeItem && <span className='text-base-content/70'>{event.activeItem}</span>}
                <span className='flex-1' />
                <span className='text-sm text-base-content/70'>{summarize(event) || 'No one connected'}</span>
              </div>

              {event.connections.length > 0 && (
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
                      {event.connections.map((c, index) => (
                        <tr key={`${c.role}:${c.userId ?? c.teamId}:${index}`}>
                          <td>
                            <span className={`badge badge-sm ${ROLE_BADGES[c.role]}`}>{ROLE_LABELS[c.role][0]}</span>
                          </td>
                          <td>
                            {c.name} <span className='text-base-content/60'>{c.detail}</span>
                          </td>
                          <td>{formatDuration(snap.serverTime - c.connectedAt)}</td>
                          <td>
                            {c.lastMessageAt === null ? (
                              <span className='text-base-content/60'>None yet</span>
                            ) : (
                              `${formatDuration(snap.serverTime - c.lastMessageAt)} ago`
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

LiveConnections.displayName = 'LiveConnections';
