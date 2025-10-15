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

  return (
    <div className='Events__card'>
      <h2 className='text-2xl font-semibold text-center cursor-pointer' onClick={handleRenameEvent}>
        {props.event.name}
      </h2>

      <div className='absolute top-2 left-2 flex gap-2'>
        <a className='tooltip tooltip-neutral' data-tip='Permissions' href={`/permissions/${props.event.id}`}>
          <Icon name='key' className='text-stone-500 hover:brightness-0' />
        </a>
        <a className='tooltip tooltip-neutral' data-tip='Duplicate'>
          <Icon name='document-duplicate' className='text-sky-500 hover:brightness-75' />
        </a>
        <a className='tooltip tooltip-neutral' data-tip='Delete' onClick={handleDeleteEvent}>
          <Icon name='trash' className='text-error hover:brightness-75' />
        </a>
      </div>

      <div className='absolute top-2 right-2 flex flex-col gap-2'>
        <a className='tooltip tooltip-neutral' data-tip='Questions'>
          <Icon name='light-bulb' className='text-yellow-500 hover:brightness-75' />
        </a>
        <a className='tooltip tooltip-neutral' data-tip='Teams' href={`/teams/${props.event.id}`}>
          <Icon name='user-group' className='text-purple-500 hover:brightness-75' />
        </a>
        <a className='tooltip tooltip-neutral' data-tip='Intro Slides'>
          <Icon name='chat-bubble-bottom-center-text' className='text-emerald-600 hover:brightness-75' />
        </a>
      </div>

      <div className='absolute bottom-2 left-2 flex gap-2'>
        <a className='tooltip tooltip-neutral' data-tip='Run'>
          <Icon name='presentation-chart-bar' className='text-lime-600 hover:brightness-75' />
        </a>
        <a className='tooltip tooltip-neutral' data-tip='Grade'>
          <Icon name='scale' className='text-amber-600 hover:brightness-75' />
        </a>
        <a className='tooltip tooltip-neutral' data-tip='Results'>
          <Icon name='chart-bar' className='text-cyan-600 hover:brightness-75' />
        </a>
      </div>
    </div>
  );
});

EventCard.displayName = 'EventCard';
