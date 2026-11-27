import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import type { AuditLogEntry } from '@/types';
import { useEffect } from 'react';
import { useSnapshot } from 'valtio';

const ACTION_LABELS: Record<AuditLogEntry['action'], string> = {
  'event.reset': 'Reset the event in memory',
  'team.release_device': 'Released a team’s device'
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

// What the action was done to, beyond the event.
function describeDetails(entry: AuditLogEntry) {
  const { teamNumber, teamName } = entry.details as { teamNumber?: number; teamName?: string };

  return teamNumber === undefined ? '' : `Team ${teamNumber} · ${teamName ?? ''}`;
}

function AuditLogList() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.auditLog);

  useEffect(() => {
    valt.loadAuditLog();
  }, [valt]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  return (
    <div className='flex flex-col gap-4 max-w-6xl'>
      <p className='text-base-content/70'>
        Every action taken from the admin page, by super admins and by event admins on their own events. Newest first.
      </p>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t load the audit log. {snap.error}
        </div>
      )}

      {snap.entries.length === 0 && !snap.error && (
        <p className='text-lg text-base-content/60'>No admin actions yet.</p>
      )}

      {snap.entries.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='table table-sm'>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {snap.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className='whitespace-nowrap'>{formatTime(entry.createdAt)}</td>
                  <td>{entry.userEmail}</td>
                  <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td>
                    {entry.eventId ? (
                      <a className='link link-hover' href={`/admin/events/${entry.eventId}`}>
                        {entry.eventName ?? entry.eventId}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{describeDetails(entry as AuditLogEntry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snap.nextBefore && (
        <button className='btn btn-sm self-start' disabled={snap.loading} onClick={() => valt.loadAuditLog(true)}>
          {snap.loading ? 'Loading…' : 'Load older'}
        </button>
      )}
    </div>
  );
}

export function AuditLog() {
  return (
    <AdminLayout tab='audit-log'>
      <AuditLogList />
    </AdminLayout>
  );
}

AuditLog.displayName = 'AuditLog';
