import './EventCard.css';

import { Icon } from '@/frontend/components/Icon';
import { memo } from 'react';
import { eventNameModal } from './EventNameModal';
import { useEventsValt, type PBEEvent } from './eventValt';
import { alertModal } from '@/frontend/components/AlertModal';
import { confirmModal } from '@/frontend/components/ConfirmModal';

interface Props {
  event: PBEEvent;
}

export const EventCard = memo((props: Props) => {
  const valt = useEventsValt();
  const { roleId } = props.event;

  // Permission checks
  const isOwner = roleId === 'owner';
  const isAdmin = roleId === 'admin';
  const isJudge = roleId === 'judge';
  const canEdit = isOwner || isAdmin;
  const canDelete = isOwner;
  const canGrade = isOwner || isAdmin || isJudge;

  const handleRenameEvent = async () => {
    const newName = await eventNameModal.open(props.event.name);

    if (newName && newName !== props.event.name) {
      try {
        valt.renameEvent(props.event.id, newName);
      } catch (error: unknown) {
        alertModal.open(`An error occurred: ${(error as Error).message}`);
      }
    }
  };

  const handleDeleteEvent = async () => {
    const confirmation = await confirmModal.open(
      `Are you sure you want to delete the event "${props.event.name}"? This action cannot be undone.`
    );

    if (confirmation) {
      try {
        await valt.deleteEvent(props.event.id);
      } catch (error: unknown) {
        alertModal.open(`An error occurred: ${(error as Error).message}`);
      }
    }
  };

  const roleColorClass = isOwner ? 'bg-success' : isAdmin ? 'bg-info' : 'bg-accent';

  return (
    <div className='Events__card'>
      <div className={`w-4 h-full absolute top-0 left-0 rounded-tl-sm rounded-bl-sm ${roleColorClass}`}></div>
      <div>
        <h2
          className={`text-2xl font-semibold text-center ${canEdit ? 'cursor-pointer' : ''}`}
          onClick={canEdit ? handleRenameEvent : undefined}
        >
          {props.event.name}
        </h2>

        {canEdit && (
          <div className='absolute top-2 left-6 flex gap-2'>
            <button
              className='tooltip tooltip-neutral'
              data-tip='Duplicate'
              aria-label={`Duplicate event ${props.event.name}`}
            >
              <Icon name='document-duplicate' className='text-sky-500 hover:brightness-75 opacity-20' />
            </button>
            {canDelete && (
              <button
                className='tooltip tooltip-neutral'
                data-tip='Delete'
                onClick={handleDeleteEvent}
                aria-label={`Delete event ${props.event.name}`}
              >
                <Icon name='trash' className='text-error hover:brightness-75' />
              </button>
            )}
          </div>
        )}

        {canEdit && (
          <div className='absolute top-2 right-2 flex flex-col gap-2'>
            <a
              className='tooltip tooltip-neutral'
              data-tip='Permissions'
              href={`/permissions/${props.event.id}`}
              aria-label={`Permissions for event ${props.event.name}`}
            >
              <Icon name='key' className='text-stone-500 hover:brightness-0' />
            </a>
            <a
              className='tooltip tooltip-neutral'
              data-tip='Teams'
              href={`/teams/${props.event.id}`}
              aria-label={`Teams for event ${props.event.name}`}
            >
              <Icon name='user-group' className='text-purple-500 hover:brightness-75' />
            </a>
            <a
              className='tooltip tooltip-neutral'
              data-tip='Languages'
              href={`/languages/${props.event.id}`}
              aria-label={`Languages for event ${props.event.name}`}
            >
              <Icon name='language' className='text-lime-500 hover:brightness-75' />
            </a>
            <a
              className='tooltip tooltip-neutral'
              data-tip='Questions'
              href={`/questions/${props.event.id}`}
              aria-label={`Questions for event ${props.event.name}`}
            >
              <Icon name='light-bulb' className='text-yellow-500 hover:brightness-75' />
            </a>
            <button
              className='tooltip tooltip-neutral'
              data-tip='Intro Slides'
              aria-label={`Intro slides for event ${props.event.name}`}
            >
              <Icon name='chat-bubble-bottom-center-text' className='text-emerald-600 hover:brightness-75 opacity-20' />
            </button>
          </div>
        )}

        <div className='absolute bottom-2 left-6 flex gap-2'>
          {canEdit && (
            <a
              className='tooltip tooltip-neutral'
              data-tip='Run Event'
              href={`/run/${props.event.id}`}
              aria-label={`Run event ${props.event.name}`}
            >
              <Icon name='presentation-chart-bar' className='text-lime-600 hover:brightness-75' />
            </a>
          )}
          {canGrade && (
            <button className='tooltip tooltip-neutral' data-tip='Grade' aria-label={`Grade event ${props.event.name}`}>
              <Icon name='scale' className='text-amber-600 hover:brightness-75 opacity-20' />
            </button>
          )}
          {canEdit && (
            <button
              className='tooltip tooltip-neutral'
              data-tip='Results'
              aria-label={`Results for event ${props.event.name}`}
            >
              <Icon name='chart-bar' className='text-cyan-600 hover:brightness-75 opacity-20' />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

EventCard.displayName = 'EventCard';
