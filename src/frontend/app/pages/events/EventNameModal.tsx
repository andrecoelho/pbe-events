import { useRef, useState } from 'react';
import { modal } from '@/frontend/components/Modal';

interface Props {
  name?: string;
}

function EventNameModal(props: Props) {
  const [name, setName] = useState(props.name ?? '');
  const handleCancel = () => eventNameModal.close();

  const handleSave = () => {
    if (name) {
      eventNameModal.close(name);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setName(event.currentTarget.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.currentTarget.value.length > 0) {
      event.preventDefault();
      eventNameModal.close(event.currentTarget.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      eventNameModal.close();
    }
  };

  return (
    <div className='modal-box'>
      <h3 className='font-bold text-lg mb-4'>{props.name ? 'Rename Event' : 'New Event'}</h3>
      <label className='input w-full'>
        <span className='label'>Event Name:</span>
        <input type='text' value={name} onChange={handleChange} onKeyDown={handleKeyDown} />
      </label>
      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled={!name || name.trim() === ''} onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}

EventNameModal.displayName = 'EventNameModal';

class EventNameModalManager {
  open = async (name?: string) => {
    return await modal.open<string | null>(<EventNameModal name={name} />);
  };

  close = (name: string | null = null) => {
    modal.close(name);
  };
}

export const eventNameModal = new EventNameModalManager();
