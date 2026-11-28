import { alertModal } from '@/frontend/components/AlertModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { memo, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import { allTags } from '@/eventTags';
import { EventRow } from './EventRow';
import { visibleEvents, type EventSort } from './eventListView';
import { eventNameModal } from './EventNameModal';
import { EventsValt, EventsValtContext } from './eventValt';

const init = () => {
  const valt = new EventsValt();

  valt.init().then((result) => {
    if (!result.ok) {
      toast.show({ message: result.error, type: 'error', persist: true });
    }
  });

  return valt;
};

// The user's events as one list with search (#71). Each row opens the event's home page.
export const Events = memo(() => {
  const valt = useMemo(init, []);
  const snap = useSnapshot(valt.store);
  const events = visibleEvents(snap.events, snap);
  const tags = allTags(snap.events);
  const archivedCount = snap.events.filter((e) => e.archivedAt).length;
  const filtering = snap.query.trim() !== '' || snap.tag !== null;

  const handleCreateEvent = async () => {
    const name = await eventNameModal.open();

    if (name) {
      try {
        await valt.createEvent(name);
      } catch (error: unknown) {
        alertModal.open((error as Error).message);
      }
    }
  };

  return (
    <EventsValtContext.Provider value={valt}>
      <div className='bg-base-100/95 flex-1 overflow-auto p-8'>
        <div className='max-w-4xl mx-auto'>
          <div className='flex flex-wrap items-center gap-4 mb-6'>
            <h1 className='text-3xl font-bold flex-1'>Events</h1>
            {snap.events.length > 0 && (
              <label className='input w-64'>
                <Icon name='magnifying-glass' className='size-4 opacity-50' />
                <input
                  type='search'
                  placeholder='Search events'
                  aria-label='Search events'
                  value={snap.query}
                  onChange={(e) => valt.setQuery(e.currentTarget.value)}
                />
              </label>
            )}
            <button className='btn btn-secondary' onClick={handleCreateEvent}>
              <Icon name='plus' className='size-4' />
              Add Event
            </button>
          </div>

          {snap.initialized && snap.events.length === 0 && (
            <div className='text-center py-24'>
              <p className='text-base-content/70 mb-4'>You don’t have any events yet.</p>
              <button className='btn btn-secondary btn-lg' onClick={handleCreateEvent}>
                <Icon name='plus' className='size-4' />
                Add your first event
              </button>
            </div>
          )}

          {snap.events.length > 0 && (
            <div className='flex flex-wrap items-center gap-3 mb-4'>
              {tags.length > 0 && (
                <select
                  className='select select-sm w-44'
                  aria-label='Filter by tag'
                  value={snap.tag ?? ''}
                  onChange={(e) => valt.setTagFilter(e.currentTarget.value || null)}
                >
                  <option value=''>All tags</option>
                  {tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              )}
              <select
                className='select select-sm w-44'
                aria-label='Sort events'
                value={snap.sort}
                onChange={(e) => valt.setSort(e.currentTarget.value as EventSort)}
              >
                <option value='name'>Sort by name</option>
                <option value='newest'>Newest first</option>
                <option value='tag'>Sort by tag</option>
              </select>
              <label className='label text-sm cursor-pointer'>
                <input
                  type='checkbox'
                  className='toggle toggle-sm'
                  checked={snap.showArchived}
                  onChange={(e) => valt.setShowArchived(e.currentTarget.checked)}
                />
                Show archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
              </label>
              {filtering && (
                <button
                  className='btn btn-ghost btn-sm'
                  onClick={() => {
                    valt.setQuery('');
                    valt.setTagFilter(null);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {snap.events.length > 0 && events.length === 0 && (
            <p role='status' className='text-base-content/70 py-8 text-center'>
              {filtering
                ? 'No events match your search or tag.'
                : 'All your events are archived. Turn on “Show archived” to see them.'}
            </p>
          )}

          {events.length > 0 && (
            <ul className='list bg-base-100 rounded-box shadow-sm'>
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </EventsValtContext.Provider>
  );
});

Events.displayName = 'Events';
