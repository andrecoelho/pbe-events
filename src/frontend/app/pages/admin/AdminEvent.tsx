import { useAppValt } from '@/frontend/app/appValt';
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
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { toast } from '@/frontend/components/Toast';
import { reportFailure } from '@/frontend/utils/api';
import { useEffect, useState, type FormEvent } from 'react';
import { useSnapshot } from 'valtio';

// /admin/events/:id
const eventIdFromUrl = () => window.location.pathname.match(/^\/admin\/events\/([^/]+)/)?.[1] ?? '';

const EVENT_ROLES: Record<string, string> = { owner: 'Owner', admin: 'Admin', judge: 'Judge' };

// Super admins reach event pages from the Events tab; event admins from Live connections.
function BackLink() {
  const { isSuperAdmin } = useSnapshot(useAppValt().store).user;

  return (
    <a className='link link-hover text-sm' href={isSuperAdmin ? '/admin/events' : '/admin'}>
      ← {isSuperAdmin ? 'Events' : 'Live connections'}
    </a>
  );
}

// Super admins only (#59): join or leave the event, and transfer its ownership.
function Management({ eventId, myRole }: { eventId: string; myRole: string | null }) {
  const valt = useAdminValt();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    const result = await valt.manageEvent(eventId, 'join');

    reportFailure(result);

    if (result.ok) {
      toast.show({ type: 'success', message: 'You’re an admin of this event now. It’s on your Events page.' });
    }
  };

  const handleLeave = async () => {
    if (
      await confirmModal.open(
        'Leave this event? You’ll lose your role on it; as a super admin you can still see it here.'
      )
    ) {
      reportFailure(await valt.manageEvent(eventId, 'leave'));
    }
  };

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !(await confirmModal.open(
        `Make ${email.trim()} the owner of this event? The current owner stays on as an admin.`
      ))
    ) {
      return;
    }

    const result = await valt.manageEvent(eventId, 'transfer', email);

    setError(result.ok ? null : result.error);

    if (result.ok) {
      setEmail('');
      toast.show({ type: 'success', message: 'Ownership transferred.' });
    }
  };

  return (
    <section className='flex flex-col gap-3'>
      <h3 className='text-lg font-semibold'>Manage</h3>
      <div className='flex flex-wrap items-center gap-3'>
        {myRole ? (
          <>
            <span>
              You’re {myRole === 'owner' ? 'the owner' : `${myRole === 'admin' ? 'an admin' : 'a judge'}`} of this
              event.
            </span>
            {myRole !== 'owner' && (
              <button className='btn btn-sm' onClick={handleLeave}>
                Leave event
              </button>
            )}
          </>
        ) : (
          <>
            <span>You’re not in this event.</span>
            <button className='btn btn-sm' onClick={handleJoin}>
              Add me as admin
            </button>
            <span className='text-sm text-base-content/70'>To open its screens and help debug it.</span>
          </>
        )}
      </div>
      <form onSubmit={handleTransfer} className='flex flex-wrap items-center gap-3'>
        <label className='input input-sm w-full max-w-sm'>
          <span className='label'>New owner</span>
          <input
            type='email'
            placeholder='Their account’s email'
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
        </label>
        <button type='submit' className='btn btn-sm'>
          Transfer ownership
        </button>
        {error && <span className='text-error text-sm'>{error}</span>}
      </form>
    </section>
  );
}

function EventPage() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.event);
  const { isSuperAdmin } = useSnapshot(useAppValt().store).user;
  const eventId = eventIdFromUrl();

  useEffect(() => valt.poll(() => valt.loadEvent(eventId)), [valt, eventId]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  if (!snap.data) {
    return (
      <div className='flex flex-col gap-4 max-w-6xl'>
        <BackLink />
        <div role='alert' className='alert alert-error'>
          {snap.error}
        </div>
      </div>
    );
  }

  const { event, live, teams, people, myRole, serverTime } = snap.data;
  const canRun = myRole === 'owner' || myRole === 'admin';

  const handleReset = async () => {
    const confirmed = await confirmModal.open(
      `Reset “${event.name}” in memory? Every open screen of this event (run, presenter, judges, results and ` +
        'teams) disconnects for a moment and reconnects, and the event is read again from the database. ' +
        'Answers and grades already saved are kept.'
    );

    if (confirmed) {
      const result = await valt.resetEvent(event.id);

      toast.show(
        result.ok
          ? { type: 'success', message: 'Event reset. Its screens are reconnecting.' }
          : { type: 'error', message: `Couldn’t reset the event. ${result.error}` }
      );
    }
  };

  const handleRelease = async (team: { id: string; number: number; name: string; status: string }) => {
    const confirmed = await confirmModal.open(
      `Release team ${team.number} (${team.name}) from its device? ` +
        (team.status === 'connected' ? 'That device disconnects right away. ' : '') +
        'The team can join again on any device with its code.'
    );

    if (confirmed) {
      const result = await valt.releaseDevice(event.id, team.id);

      toast.show(
        result.ok
          ? { type: 'success', message: `Team ${team.number} released.` }
          : { type: 'error', message: `Couldn’t release the team. ${result.error}` }
      );
    }
  };
  const connectedTeams = teams.filter((team) => team.status === 'connected').length;

  return (
    <div className='flex flex-col gap-6 max-w-6xl'>
      <div className='flex flex-col gap-2'>
        <BackLink />
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-bold'>{event.name}</h2>
          {live && <span className={`badge ${RUN_STATUS[live.runStatus][1]}`}>{RUN_STATUS[live.runStatus][0]}</span>}
          {live?.activeItem && <span className='text-base-content/70'>{live.activeItem}</span>}
          <span className='flex-1' />
          {live && (
            <button
              className='btn btn-sm btn-warning tooltip tooltip-bottom'
              data-tip='Reconnects every screen and reloads the event from the database'
              onClick={handleReset}
            >
              Reset in memory
            </button>
          )}
          {canRun && (
            <a className='btn btn-sm' href={`/run/${event.id}`}>
              Open the Run screen
            </a>
          )}
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
        <h3 className='text-lg font-semibold'>Connected now</h3>
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
                  <th />
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
                      <td className='text-right'>
                        {team.hasDevice && (
                          <button className='btn btn-xs' onClick={() => handleRelease(team)}>
                            Release device
                          </button>
                        )}
                      </td>
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

      <section className='flex flex-col gap-2'>
        <h3 className='text-lg font-semibold'>Roles</h3>
        {people.length === 0 ? (
          <p className='text-base-content/60'>No one has a role on this event.</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='table table-sm'>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.userId}>
                    <td>
                      {isSuperAdmin ? (
                        <a className='link link-hover' href={`/admin/users/${person.userId}`}>
                          {person.name || person.email}
                        </a>
                      ) : (
                        person.name || person.email
                      )}{' '}
                      <span className='text-base-content/60'>{person.name && person.email}</span>
                    </td>
                    <td>{EVENT_ROLES[person.role] ?? person.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isSuperAdmin && <Management eventId={event.id} myRole={myRole} />}
    </div>
  );
}

export function AdminEvent() {
  const { isSuperAdmin } = useSnapshot(useAppValt().store).user;

  return (
    <AdminLayout tab={isSuperAdmin ? 'events' : 'connections'}>
      <EventPage />
    </AdminLayout>
  );
}

AdminEvent.displayName = 'AdminEvent';
