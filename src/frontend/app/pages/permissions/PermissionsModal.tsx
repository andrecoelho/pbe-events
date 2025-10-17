import { Icon } from '@/frontend/components/Icon';
import { modal } from '@/frontend/components/Modal';
import { createRef, useMemo } from 'react';
import { proxy, useSnapshot } from 'valtio';

interface Props {
  name?: string;
}

interface Store {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  emailToSearch: string;
  searchStatus: 'idle' | 'searching' | 'done';
}

const init = () => {
  const store = proxy<Store>({ emailToSearch: '', searchStatus: 'idle' });

  const searchUserByEmail = async (email: string) => {
    store.searchStatus = 'searching';

    const result = await fetch(`/api/users?email=${encodeURIComponent(email)}`);

    store.searchStatus = 'done';

    if (result.status === 200) {
      const response = (await result.json()) as { user: Store['user'] };

      store.user = response.user;
      store.user!.email = email;

      return true;
    } else if (result.status === 404) {
      store.user = undefined;
    }

    store.searchStatus = 'done';

    return false;
  };

  return { store, searchUserByEmail };
};

function PermissionsModal(props: Props) {
  const { store, searchUserByEmail } = useMemo(init, []);
  const snap = useSnapshot(store);
  const searchRef = createRef<HTMLInputElement>();

  const handleCancel = () => permissionsModal.close();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.searchStatus = 'idle';
    store.emailToSearch = e.target.value;
  };

  const handleSearch = () => {
    searchUserByEmail(searchRef.current?.value ?? '');
  };

  const handleRemoveUser = () => {
    store.user = undefined;
    store.emailToSearch = '';
    store.searchStatus = 'idle';
  };

  return (
    <div className='modal-box w-[600px] max-w-[600px]'>
      <h3 className='font-bold text-lg mb-4'>{props.name ? 'Edit User' : 'Add User'}</h3>
      <div className='flex flex-col gap-2 items-center'>
        {(snap.searchStatus !== 'done' || (snap.searchStatus === 'done' && !snap.user)) && (
          <div className='join w-full'>
            <div className='w-full'>
              <label className='input validator join-item w-full'>
                <Icon name='magnifying-glass' className='size-4 text-stone-400' />
                <input
                  type='search'
                  name='email'
                  autoComplete='off'
                  className='placeholder:text-stone-400'
                  placeholder='Search by email address ...'
                  pattern='^\w+@\w+\.\w+$'
                  required
                  aria-invalid={snap.searchStatus === 'done' && !snap.user ? 'true' : 'false'}
                  ref={searchRef}
                  value={snap.emailToSearch}
                  onChange={handleChange}
                />
              </label>
              {snap.searchStatus === 'done' && !snap.user && (
                <p className='validator-hint'>
                  <span>Could not find a user with that email address.</span>
                </p>
              )}
            </div>
            <button
              className='btn btn-accent join-item w-32'
              onClick={handleSearch}
              disabled={snap.searchStatus === 'searching' || snap.emailToSearch.length === 0}
            >
              {snap.searchStatus === 'searching' ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}

        {snap.searchStatus === 'done' && snap.user && (
          <div className='flex gap-4 w-full items-center'>
            <div className='avatar'>
              <div className='w-8 rounded-full'>
                <img src={`/user-image/${snap.user.id}`} />
              </div>
            </div>
            <div className='flex-1'>
              {snap.user.firstName} {snap.user.lastName} ({snap.user.email})
            </div>
            <div>
              <a className='tooltip tooltip-neutral' data-tip='Delete' onClick={handleRemoveUser}>
                <Icon name='trash' className='text-error size-6 cursor-pointer hover:brightness-75' />
              </a>
            </div>
          </div>
        )}
      </div>
      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled>
          Save
        </button>
      </div>
    </div>
  );
}

PermissionsModal.displayName = 'PermissionsModal';

class PermissionsModalManager {
  open = async (name?: string) => {
    return await modal.open<string | null>(<PermissionsModal name={name} />);
  };

  close = (name: string | null = null) => {
    modal.close(name);
  };
}

export const permissionsModal = new PermissionsModalManager();
