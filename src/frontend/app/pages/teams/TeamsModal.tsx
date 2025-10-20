import { Icon } from '@/frontend/components/Icon';
import { modal } from '@/frontend/components/Modal';
import { useMemo } from 'react';
import { proxy, useSnapshot } from 'valtio';
import type { TeamsValt } from '@/frontend/app/pages/teams/teamsValt';

interface Props {
  team?: Team;
  teamsValt: TeamsValt;
}

interface Team {
  id: string;
  name: string;
  number: number;
}

interface Store {
  name: string;
  validationError?: string;
  isSubmitting: boolean;
}

const init = (teamsValt: TeamsValt, team?: Team) => {
  const store = proxy<Store>({
    name: team?.name || '',
    validationError: undefined,
    isSubmitting: false
  });

  const handleCancel = () => teamsModal.close();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.name = e.target.value;
    store.validationError = undefined;
  };

  const handleSave = async () => {
    store.isSubmitting = true;
    store.validationError = undefined;

    try {
      let result: { ok: boolean; error?: string };

      if (team) {
        result = await teamsValt.updateTeam(team.id, store.name.trim(), team.number);
      } else {
        result = await teamsValt.addTeam(store.name.trim());
      }

      if (result.ok) {
        teamsModal.close();
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
    handleSave
  };
};

function TeamsModal(props: Props) {
  const { store, handleCancel, handleChange, handleSave } = useMemo(
    () => init(props.teamsValt, props.team),
    [props.teamsValt, props.team]
  );

  const snap = useSnapshot(store);
  const isValid = snap.name.trim().length > 0 && !snap.isSubmitting;

  return (
    <div className='modal-box w-[600px] max-w-[600px]'>
      <h3 className='font-bold text-lg mb-4'>{props.team ? 'Edit Team Name' : 'Add Team'}</h3>
      <div className='flex flex-col gap-2 items-center'>
        <div className='w-full'>
          <label className='input validator w-full'>
            <Icon name='user-group' className='size-4 text-stone-400' />
            <input
              type='text'
              name='teamName'
              autoComplete='off'
              className='placeholder:text-stone-400'
              placeholder='Team name'
              required
              aria-invalid={snap.validationError ? 'true' : 'false'}
              value={snap.name}
              onChange={handleChange}
            />
          </label>
          {snap.validationError && (
            <p className='validator-hint'>
              <span>{snap.validationError}</span>
            </p>
          )}
        </div>
      </div>
      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel} disabled={snap.isSubmitting}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled={!isValid} onClick={handleSave}>
          {snap.isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

TeamsModal.displayName = 'TeamsModal';

class TeamsModalManager {
  open = async (teamsValt: TeamsValt, team?: Team) => {
    return await modal.open(<TeamsModal teamsValt={teamsValt} team={team} />);
  };

  close = () => {
    modal.close();
  };
}

export const teamsModal = new TeamsModalManager();
