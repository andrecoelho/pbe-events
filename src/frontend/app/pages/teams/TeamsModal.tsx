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
  languageId: string | null;
}

interface Store {
  name: string;
  languageId: string;
  validationError?: string;
  isSubmitting: boolean;
}

const init = (teamsValt: TeamsValt, team?: Team) => {
  const store = proxy<Store>({
    name: team?.name || '',
    languageId: team?.languageId || '',
    validationError: undefined,
    isSubmitting: false
  });

  const handleCancel = () => teamsModal.close();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.name = e.target.value;
    store.validationError = undefined;
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    store.languageId = e.target.value;
    store.validationError = undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (store.isSubmitting) {
      return;
    }

    store.isSubmitting = true;
    store.validationError = undefined;

    try {
      let result: { ok: boolean; error?: string };

      if (team) {
        result = await teamsValt.updateTeam(team.id, store.name, team.number, store.languageId);
      } else {
        result = await teamsValt.addTeam(store.name, store.languageId);
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
    handleLanguageChange,
    handleSubmit
  };
};

function TeamsModal(props: Props) {
  const { store, handleCancel, handleChange, handleLanguageChange, handleSubmit } = useMemo(
    () => init(props.teamsValt, props.team),
    [props.teamsValt, props.team]
  );

  const localSnap = useSnapshot(store);
  const teamsValtSnap = useSnapshot(props.teamsValt.store);
  const isValid = localSnap.name.trim().length > 0 && localSnap.languageId.length > 0 && !localSnap.isSubmitting;

  return (
    <div className='modal-box w-[600px] max-w-[600px]'>
      <h3 className='font-bold text-lg mb-4'>{props.team ? 'Edit Team Name' : 'Add Team'}</h3>
      <form onSubmit={handleSubmit}>
        <div className='flex gap-2 items-center'>
          <div className='flex-1'>
            <label className='input validator w-full'>
              <Icon name='user-group' className='size-4 text-stone-400' />
              <input
                type='text'
                name='teamName'
                autoComplete='off'
                className='placeholder:text-stone-400'
                placeholder='Team name'
                required
                aria-invalid={localSnap.validationError ? 'true' : 'false'}
                value={localSnap.name}
                onChange={handleChange}
              />
            </label>
            {localSnap.validationError && (
              <p className='validator-hint'>
                <span>{localSnap.validationError}</span>
              </p>
            )}
          </div>
          <div className='flex-none w-48'>
            <label className='form-control w-full'>
              <select
                name='language'
                className='select select-bordered w-full'
                value={localSnap.languageId}
                onChange={handleLanguageChange}
                required
                aria-invalid={localSnap.validationError ? 'true' : 'false'}
              >
                <option value='' disabled>
                  Choose a language
                </option>

                {teamsValtSnap.languages.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className='modal-action flex justify-between'>
          <button type='button' className='btn btn-secondary' onClick={handleCancel} disabled={localSnap.isSubmitting}>
            Cancel
          </button>
          <button type='submit' className='btn btn-primary' disabled={!isValid}>
            {localSnap.isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
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
