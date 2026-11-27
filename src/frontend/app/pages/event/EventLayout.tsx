import { useAppValt, type EventRoleId } from '@/frontend/app/appValt';
import { Icon } from '@/frontend/components/Icon';
import { eventIdFromPath, eventUrl, type EventSection } from '@/eventUrls';
import { memo, useEffect, type ElementType } from 'react';
import { useSnapshot } from 'valtio';

export const MANAGERS: EventRoleId[] = ['owner', 'admin'];
const EVERYONE: EventRoleId[] = ['owner', 'admin', 'judge'];

// The event menu, in the order an event is prepared and then run. `group` starts a new group after a divider.
const SECTIONS: { id: EventSection; label: string; roles: EventRoleId[]; group?: boolean }[] = [
  { id: 'languages', label: 'Languages', roles: MANAGERS },
  { id: 'questions', label: 'Questions', roles: MANAGERS },
  { id: 'teams', label: 'Teams', roles: MANAGERS },
  { id: 'slides', label: 'Slides', roles: MANAGERS },
  { id: 'permissions', label: 'Permissions', roles: MANAGERS },
  { id: 'run', label: 'Run', roles: MANAGERS, group: true },
  { id: 'grade', label: 'Grade', roles: EVERYONE },
  { id: 'results', label: 'Results', roles: MANAGERS }
];

// The sections the role can open, for the menu and the event's landing page.
export const sectionsFor = (roleId: EventRoleId) => SECTIONS.filter((s) => s.roles.includes(roleId));

// Opens the presenter screen in its own window.
export const openPresenter = (eventId: string) =>
  window.open(`/event-run/presenter?eventId=${eventId}`, '_blank', 'width=800,height=600,popup=yes');

// The event workspace's frame (#15): the event's name, a menu of its sections and the section's page.
export const EventLayout = memo(({ section, Page }: { section: EventSection | null; Page: ElementType }) => {
  const appValt = useAppValt();
  const snap = useSnapshot(appValt.store);
  const eventId = eventIdFromPath(window.location.pathname) ?? '';
  const event = snap.currentEvent?.id === eventId ? snap.currentEvent : null;

  useEffect(() => {
    appValt.loadEvent(eventId);
  }, [appValt, eventId]);

  const error = snap.currentEventError?.eventId === eventId ? snap.currentEventError.message : null;

  if (error) {
    return (
      <div className='flex-1 p-8'>
        <div role='alert' className='alert alert-error max-w-xl'>
          {error}
          <a className='link' href='/'>
            Back to events
          </a>
        </div>
      </div>
    );
  }

  if (!event) {
    return <div className='flex-1' />;
  }

  const sections = sectionsFor(event.roleId);
  const canPresent = MANAGERS.includes(event.roleId);

  return (
    <div className='flex-1 min-h-0 flex flex-col'>
      <nav
        aria-label='Event'
        className='flex-none flex items-center gap-4 bg-base-200 px-8 border-b border-base-300 overflow-x-auto'
      >
        <a href={eventUrl(eventId)} className='font-semibold truncate max-w-64 py-2 hover:underline' title={event.name}>
          {event.name}
        </a>
        <div role='tablist' className='tabs tabs-border flex-nowrap'>
          {sections.map((s) => (
            <a
              key={s.id}
              role='tab'
              href={eventUrl(eventId, s.id)}
              aria-current={s.id === section ? 'page' : undefined}
              className={`tab whitespace-nowrap ${s.group ? 'ml-4 border-l border-base-300' : ''} ${s.id === section ? 'tab-active' : ''}`}
            >
              {s.label}
            </a>
          ))}
        </div>
        <div className='flex-1' />
        {canPresent && (
          <button className='btn btn-ghost btn-sm flex-none' onClick={() => openPresenter(eventId)}>
            <Icon name='presentation-chart-bar' className='size-4' />
            Present
          </button>
        )}
      </nav>
      <div className='flex-1 min-h-0 flex flex-col'>
        <Page />
      </div>
    </div>
  );
});

EventLayout.displayName = 'EventLayout';

// An event section's page inside the workspace frame, as its own component so each gets its own route.
export const inEventLayout = (section: EventSection, Page: ElementType) => {
  const Section = () => <EventLayout section={section} Page={Page} />;

  Section.displayName = `EventSection(${section})`;

  return Section;
};
