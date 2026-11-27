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

// The event workspace's frame (#15): breadcrumbs (#70), a menu of the event's sections and the section's page.
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
  const current = SECTIONS.find((s) => s.id === section);

  return (
    <div className='flex-1 min-h-0 flex flex-col'>
      <nav aria-label='Event' className='flex-none bg-base-200 px-8 border-b border-base-300'>
        <div className='flex items-center gap-4 pt-2'>
          <div className='breadcrumbs text-sm py-0 flex-1 min-w-0'>
            <ul>
              <li>
                <a href='/'>Events</a>
              </li>
              <li className='min-w-0'>
                {current ? (
                  <a href={eventUrl(eventId)} className='truncate max-w-64 inline-block' title={event.name}>
                    {event.name}
                  </a>
                ) : (
                  <span aria-current='page' className='truncate max-w-64 inline-block' title={event.name}>
                    {event.name}
                  </span>
                )}
              </li>
              {current && (
                <li>
                  {/* The section's name is the page's heading. */}
                  <h1 aria-current='page' className='font-semibold'>
                    {current.label}
                  </h1>
                </li>
              )}
            </ul>
          </div>
          {canPresent && (
            <button className='btn btn-ghost btn-sm flex-none' onClick={() => openPresenter(eventId)}>
              <Icon name='presentation-chart-bar' className='size-4' />
              Present
            </button>
          )}
        </div>
        <div role='tablist' className='tabs tabs-border flex-nowrap overflow-x-auto -ml-3'>
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
