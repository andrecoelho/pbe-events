import { Icon } from '@/frontend/components/Icon';
import { modal } from '@/frontend/components/Modal';
import { useMemo } from 'react';
import { proxy, useSnapshot } from 'valtio';
import type { RunsValt } from '@/frontend/app/pages/runs/runsValt';

interface Props {
  runsValt: RunsValt;
  runId: string;
  currentGracePeriod: number;
}

interface Store {
  gracePeriod: string;
  validationError?: string;
  isSubmitting: boolean;
}

const init = (runsValt: RunsValt, runId: string, currentGracePeriod: number) => {
  const store = proxy<Store>({
    gracePeriod: currentGracePeriod.toString(),
    validationError: undefined,
    isSubmitting: false
  });

  const handleCancel = () => gracePeriodModal.close();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.gracePeriod = e.target.value;
    store.validationError = undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (store.isSubmitting) {
      return;
    }

    const gracePeriodNum = parseInt(store.gracePeriod, 10);

    if (isNaN(gracePeriodNum) || gracePeriodNum < 0) {
      store.validationError = 'Grace period must be a non-negative number';
      return;
    }

    store.isSubmitting = true;
    store.validationError = undefined;

    try {
      const result = await runsValt.updateGracePeriod(runId, gracePeriodNum);

      if (result.ok) {
        gracePeriodModal.close();
      } else {
        store.validationError = result.error;
      }
    } finally {
      store.isSubmitting = false;
    }
  };

  return {
    store,
    handleCancel,
    handleChange,
    handleSubmit
  };
};

function GracePeriodModal(props: Props) {
  const { store, handleCancel, handleChange, handleSubmit } = useMemo(
    () => init(props.runsValt, props.runId, props.currentGracePeriod),
    [props.runsValt, props.runId, props.currentGracePeriod]
  );

  const snap = useSnapshot(store);
  const gracePeriodNum = parseInt(snap.gracePeriod, 10);
  const isValid = !isNaN(gracePeriodNum) && gracePeriodNum >= 0 && !snap.isSubmitting;

  return (
    <div className='modal-box w-[600px] max-w-[600px]'>
      <h3 className='font-bold text-lg mb-4'>Update Grace Period</h3>
      <form onSubmit={handleSubmit}>
        <div className='flex flex-col gap-2 items-center'>
          <div className='w-full'>
            <label className='input validator w-full'>
              <Icon name='scale' className='size-4 text-stone-400' />
              <input
                type='number'
                name='gracePeriod'
                autoComplete='off'
                className='placeholder:text-stone-400'
                placeholder='Grace period (seconds)'
                required
                min='0'
                step='1'
                aria-invalid={snap.validationError ? 'true' : 'false'}
                value={snap.gracePeriod}
                onChange={handleChange}
              />
            </label>
            {snap.validationError && (
              <p className='validator-hint'>
                <span>{snap.validationError}</span>
              </p>
            )}
          </div>
          <p className='text-sm text-stone-500 w-full'>
            Grace period is the additional time (in seconds) teams have to submit answers after the timer ends.
          </p>
        </div>
        <div className='modal-action flex justify-between'>
          <button type='button' className='btn btn-secondary' onClick={handleCancel} disabled={snap.isSubmitting}>
            Cancel
          </button>
          <button type='submit' className='btn btn-primary' disabled={!isValid}>
            {snap.isSubmitting ? 'Updating...' : 'Update'}
          </button>
        </div>
      </form>
    </div>
  );
}

GracePeriodModal.displayName = 'GracePeriodModal';

class GracePeriodModalManager {
  open = async (runsValt: RunsValt, runId: string, currentGracePeriod: number) => {
    return await modal.open(<GracePeriodModal runsValt={runsValt} runId={runId} currentGracePeriod={currentGracePeriod} />);
  };

  close = () => {
    modal.close();
  };
}

export const gracePeriodModal = new GracePeriodModalManager();
