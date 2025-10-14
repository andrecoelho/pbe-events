import './Events.css';

import { memo, useMemo } from 'react';
import { useSnapshot } from 'valtio';

import { alertModal } from '@/frontend/components/AlertModal';

import { EventCard } from './EventCard';
import { eventNameModal } from './EventNameModal';
import { EventsValt, EventsValtContext } from './eventValt';

const init = () => {
  const valt = new EventsValt();

  valt.init();

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
          {!snap.didInit && (
            <div className='absolute inset-0 flex flex-col items-center justify-center'>
              <span className='loading loading-ring loading-xl bg-accent' />
            </div>
          )}

          {snap.didInit && snap.events.length === 0 && (
            <div className='absolute inset-0 flex flex-col items-center justify-center'>
              <button className='btn btn-secondary btn-lg' onClick={handleCreateEvent}>
                Add your first event
              </button>
            </div>
          )}

          {snap.didInit && snap.events.length > 0 && (
            <div className='Events__grid'>
              {snap.events.map((event) => (
                <div key={event.id} className='relative'>
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </EventsValtContext.Provider>
  );
});

Events.displayName = 'Events';
