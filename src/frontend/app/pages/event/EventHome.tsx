import { useAppValt } from '@/frontend/app/appValt';
import { EventLayout, sectionsFor } from '@/frontend/app/pages/event/EventLayout';
import { eventUrl } from '@/eventUrls';
import { memo } from 'react';
import { useSnapshot } from 'valtio';

// The event's landing page at /events/:id. For now it lists the sections; #69 turns it into the event's home
// (what's ready, what's missing, quick actions).
const EventHomeContent = memo(() => {
  const appValt = useAppValt();
  const event = useSnapshot(appValt.store).currentEvent;

  if (!event) {
    return null;
  }

  return (
    <div className='bg-base-100/95 flex-1 overflow-auto p-8'>
      <h1 className='text-3xl font-bold mb-6'>{event.name}</h1>
      <ul className='menu bg-base-200 rounded-box w-64'>
        {sectionsFor(event.roleId).map((s) => (
          <li key={s.id}>
            <a href={eventUrl(event.id, s.id)}>{s.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
});

EventHomeContent.displayName = 'EventHomeContent';

export const EventHome = () => <EventLayout section={null} Page={EventHomeContent} />;

EventHome.displayName = 'EventHome';
