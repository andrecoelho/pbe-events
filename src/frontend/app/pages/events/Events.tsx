import { alertModal } from '@/frontend/components/AlertModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { memo, useMemo } from 'react';
import { useSnapshot } from 'valtio';
import { EventCard } from './EventCard';
import { eventNameModal } from './EventNameModal';
import './Events.css';
import { EventsValt, EventsValtContext } from './eventValt';

const init = () => {
  const valt = new EventsValt();

  valt.init().then((result) => {
    if (!result.ok) {
      toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
    }
  });

  return valt;
};

export const Events = memo(() => {
  const valt = useMemo(init, []);
  const snap = useSnapshot(valt.store);

  const handleCreateEvent = async () => {
    const name = await eventNameModal.open();

    if (name) {
      try {
        await valt.createEvent(name);
      } catch (error: unknown) {
        alertModal.open(`An error occurred: ${(error as Error).message}`);
      }
    }
  };

  return (
    <EventsValtContext.Provider value={valt}>
      <div className='Events'>
        <div className='Events__content'>
          {snap.initialized && snap.events.length === 0 && (
            <div className='absolute inset-0 flex flex-col items-center justify-center'>
              <button className='btn btn-secondary btn-lg' onClick={handleCreateEvent}>
                <Icon name='plus' className='size-4' />
                Add your first event
              </button>
            </div>
          )}

          {snap.initialized && snap.events.length > 0 && (
            <div className='Events__grid'>
              {snap.events.map((event) => (
                <div key={event.id} className='relative'>
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* {snap.initialized && snap.events.length > 0 && ( */}
        <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
          <button className='btn btn-secondary' onClick={handleCreateEvent}>
            <Icon name='plus' className='size-4' />
            Add Event
          </button>
        </footer>
        {/* )} */}
      </div>
    </EventsValtContext.Provider>
  );
});

Events.displayName = 'Events';
