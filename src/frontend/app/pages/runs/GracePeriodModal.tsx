import { useState } from 'react';
import { modal } from '@/frontend/components/Modal';

interface Props {
  currentValue: number;
}

function GracePeriodModal(props: Props) {
  const [value, setValue] = useState(props.currentValue.toString());
  const handleCancel = () => gracePeriodModal.close();

  const handleSave = () => {
    const gracePeriod = parseInt(value, 10);

    if (!isNaN(gracePeriod) && gracePeriod >= 0) {
      gracePeriodModal.close(gracePeriod);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.currentTarget.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const gracePeriod = parseInt(event.currentTarget.value, 10);

      if (!isNaN(gracePeriod) && gracePeriod >= 0) {
        gracePeriodModal.close(gracePeriod);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      gracePeriodModal.close();
    }
  };

  const isValid = () => {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0;
  };

  return (
    <div className='modal-box'>
      <h3 className='font-bold text-lg mb-4'>Update Grace Period</h3>
      <label className='input w-full'>
        <span className='label'>Grace Period (seconds):</span>
        <input type='number' min='0' value={value} onChange={handleChange} onKeyDown={handleKeyDown} />
      </label>
      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled={!isValid()} onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}

GracePeriodModal.displayName = 'GracePeriodModal';

class GracePeriodModalManager {
  open = async (currentValue: number) => {
    return await modal.open<number | null>(<GracePeriodModal currentValue={currentValue} />);
  };

  close = (value: number | null = null) => {
    modal.close(value);
  };
}

export const gracePeriodModal = new GracePeriodModalManager();
