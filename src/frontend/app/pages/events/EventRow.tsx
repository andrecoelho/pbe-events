import { RUN_STATUS_LABEL, setupProblems } from '@/eventReadiness';
import { allTags } from '@/eventTags';
import { eventUrl } from '@/eventUrls';
import { alertModal } from '@/frontend/components/AlertModal';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { roleBadgeColors, roleGradients } from '@/frontend/utils/roleColors';
import { memo, useRef, type CSSProperties } from 'react';
import { eventNameModal } from './EventNameModal';
import { eventTagsModal } from './EventTagsModal';
import type { Snapshot } from 'valtio';
import { useEventsValt, type PBEEvent } from './eventValt';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

// 'no languages, no teams' → 'No languages, no teams'.
const sentence = (parts: string[]) => {
  const text = parts.join(', ');

  return text.charAt(0).toUpperCase() + text.slice(1);
};

// Under the name: whether the event is running or done, else what it still needs (owners and admins only).
// Nothing for archived events.
function Hint({ event }: { event: Snapshot<PBEEvent> }) {
  if (event.archivedAt) {
    return null;
  }

  if (event.runStatus !== 'not_started') {
    return (
      <span className={`badge badge-sm ${event.runStatus === 'completed' ? 'badge-ghost' : 'badge-success'}`}>
        {RUN_STATUS_LABEL[event.runStatus]}
      </span>
    );
  }

  if (!event.counts) {
    return null;
  }

  const problems = setupProblems(event.counts);

  return problems.length === 0 ? (
    <span className='text-sm text-success'>Ready to run</span>
  ) : (
    <span className='text-sm text-base-content/70'>
      <Icon name='exclamation-triangle' className='size-4 inline -mt-0.5 mr-1 text-warning' />
      {sentence(problems)}
    </span>
  );
}

// One event in the list (#71): name (opens the event), role, creation date and, for owners and admins, a menu.
export const EventRow = memo(({ event }: { event: Snapshot<PBEEvent> }) => {
  const valt = useEventsValt();
  const menuRef = useRef<HTMLUListElement>(null);
  const canEdit = event.roleId === 'owner' || event.roleId === 'admin';
  const canDelete = event.roleId === 'owner';
  const menuId = `EventRow__menu-${event.id}`;
  const anchor = `--event-menu-${event.id}`;

  const run = async (action: () => Promise<void>) => {
    menuRef.current?.hidePopover();

    try {
      await action();
    } catch (error: unknown) {
      alertModal.open((error as Error).message);
    }
  };

  const handleRename = () =>
    run(async () => {
      const name = await eventNameModal.open(event.name);

      if (name && name !== event.name) {
        await valt.renameEvent(event.id, name);
      }
    });

  const handleDuplicate = () =>
    run(async () => {
      const name = await eventNameModal.open();

      if (name) {
        await valt.duplicateEvent(event.id, name);
      }
    });

  const handleTags = () =>
    run(async () => {
      const tags = await eventTagsModal.open({
        eventName: event.name,
        tags: event.tags,
        suggestions: allTags(valt.store.events)
      });

      if (tags) {
        await valt.setTags(event.id, tags);
      }
    });

  const handleArchive = () => run(() => valt.setArchived(event.id, !event.archivedAt));

  const handleDelete = () =>
    run(async () => {
      const confirmed = await confirmModal.open(
        `Are you sure you want to delete the event "${event.name}"? This action cannot be undone.`
      );

      if (confirmed) {
        await valt.deleteEvent(event.id);
      }
    });

  return (
    <li className='list-row items-center [&:not(:last-child)]:after:border-base-300'>
      <div className={`w-1.5 self-stretch rounded-full ${roleGradients[event.roleId]}`} aria-hidden='true' />
      <div className='min-w-0'>
        <div className='flex items-center gap-2 min-w-0'>
          <a
            href={eventUrl(event.id)}
            className={`font-semibold text-lg link link-hover truncate ${event.archivedAt ? 'text-base-content/60' : ''}`}
          >
            {event.name}
          </a>
          {event.archivedAt && <span className='badge badge-sm badge-ghost flex-none'>Archived</span>}
        </div>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <Hint event={event} />
          {event.tags.length > 0 && (
            <ul className='flex flex-wrap gap-1' aria-label='Tags'>
              {event.tags.map((tag) => (
                <li key={tag}>
                  <button
                    className='badge badge-sm badge-outline cursor-pointer hover:badge-neutral'
                    title={`Show only events tagged “${tag}”`}
                    onClick={() => valt.setTagFilter(tag)}
                  >
                    {tag}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <span className={`badge badge-sm capitalize w-16 ${roleBadgeColors[event.roleId]}`}>{event.roleId}</span>
      <span className='text-sm text-base-content/60 whitespace-nowrap hidden sm:inline w-36 text-right'>
        Created {dateFormat.format(new Date(event.createdAt))}
      </span>
      {canEdit ? (
        // One grid cell for the button and its menu (the menu shows in the top layer).
        <div className='flex'>
          <button
            className='btn btn-ghost btn-sm btn-square'
            popoverTarget={menuId}
            style={{ anchorName: anchor } as CSSProperties}
            aria-label={`Actions for ${event.name}`}
          >
            <Icon name='chevron-down' className='size-4' />
          </button>
          <ul
            ref={menuRef}
            id={menuId}
            popover='auto'
            className='dropdown dropdown-end menu bg-base-100 rounded-box z-10 w-40 p-2 shadow'
            style={{ positionAnchor: anchor } as CSSProperties}
          >
            <li>
              <button onClick={handleRename}>Rename</button>
            </li>
            <li>
              <button onClick={handleDuplicate}>Duplicate</button>
            </li>
            <li>
              <button onClick={handleTags}>Edit tags</button>
            </li>
            <li>
              <button onClick={handleArchive}>{event.archivedAt ? 'Unarchive' : 'Archive'}</button>
            </li>
            {canDelete && (
              <li>
                <button className='text-error' onClick={handleDelete}>
                  Delete
                </button>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <span className='w-8' />
      )}
    </li>
  );
});

EventRow.displayName = 'EventRow';
