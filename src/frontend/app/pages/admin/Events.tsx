import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { formatDate, RUN_STATUS } from '@/frontend/app/pages/admin/adminFormat';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import { debounce } from '@/frontend/utils/debounce';
import { useEffect, useMemo } from 'react';
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

function EventList() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.events);
  const search = useMemo(() => debounce((query: string) => valt.searchEvents(query), 300), [valt]);

  useEffect(() => {
    valt.searchEvents(valt.store.events.query);
  }, [valt]);

  const events = snap.data?.events ?? [];

  return (
    <div className='flex flex-col gap-4 max-w-6xl'>
      <label className='input w-full max-w-md'>
        <span className='label'>Search</span>
        <input
          type='search'
          placeholder='Event name or owner’s email'
          defaultValue={snap.query}
          onChange={(e) => search(e.currentTarget.value)}
          autoFocus
        />
      </label>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t search the events. {snap.error}
        </div>
      )}

      {!snap.loaded ? (
        <span className='loading loading-spinner' />
      ) : events.length === 0 ? (
        <p className='text-lg text-base-content/60'>
          {snap.query ? `No events match “${snap.query}”.` : 'There are no events yet.'}
        </p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='table table-sm'>
            <thead>
              <tr>
                <th>Event</th>
                <th>Owner</th>
                <th>People</th>
                <th>Teams</th>
                <th>Questions</th>
                <th>Run</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className='hover:bg-base-200 cursor-pointer' onClick={() => openEvent(event.id)}>
                  <td>
                    <span className='flex flex-wrap items-center gap-2'>
                      <a
                        className='link link-hover font-semibold'
                        href={`/admin/events/${event.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.name}
                      </a>
                      {event.live && <span className='badge badge-sm badge-success'>Open</span>}
                    </span>
                  </td>
                  <td>
                    {event.owner ? (
                      <>
                        {event.owner.name || event.owner.email}{' '}
                        <span className='text-base-content/60'>{event.owner.name && event.owner.email}</span>
                      </>
                    ) : (
                      <span className='badge badge-sm badge-warning'>No owner</span>
                    )}
                  </td>
                  <td>{event.peopleCount}</td>
                  <td>{event.teamCount}</td>
                  <td>{event.questionCount}</td>
                  <td className='whitespace-nowrap'>{event.runStatus ? RUN_STATUS[event.runStatus][0] : '—'}</td>
                  <td className='whitespace-nowrap'>{formatDate(event.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snap.data?.more && (
        <p className='text-sm text-base-content/70'>Showing the 50 newest matches. Search to narrow them down.</p>
      )}
    </div>
  );
}

export function Events() {
  return (
    <AdminLayout tab='events'>
      <EventList />
    </AdminLayout>
  );
}

Events.displayName = 'AdminEvents';
