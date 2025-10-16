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
  foundUser: boolean;
  searchDone: boolean;
  isSearching: boolean;
}

const init = () => {
  const store = proxy<Store>({ emailToSearch: '', foundUser: false, searchDone: false, isSearching: false });

  const searchUserByEmail = async (email: string) => {
    store.isSearching = true;
    const result = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
    store.isSearching = false;

    if (result.status === 200) {
      const response = (await result.json()) as { user: Store['user'] };
      store.user = response.user;
      store.user!.email = email;
      store.foundUser = true;
      store.searchDone = true;

      return true;
    } else if (result.status === 404) {
      store.user = undefined;
      store.foundUser = false;
      store.searchDone = true;
    }

    return false;
  };

  return { store, searchUserByEmail };
};

function PermissionsModal(props: Props) {
  const { store, searchUserByEmail } = useMemo(init, []);
  const snap = useSnapshot(store);
  const searchRef = createRef<HTMLInputElement>();

  const handleCancel = () => permissionsModal.close();

  const handleSearch = () => {
    searchUserByEmail(searchRef.current?.value ?? '');
  };

  return (
    <div className='modal-box'>
      <h3 className='font-bold text-lg mb-4'>{props.name ? 'Edit User' : 'Add User'}</h3>
      <div className='flex gap-2 items-center'>
        {(!snap.searchDone || !snap.foundUser) && (
          <>
            <label className='input flex-1'>
              <Icon name='magnifying-glass' className='size-4 text-stone-400' />
              <input
                type='search'
                name='email'
                autoComplete='off'
                className='placeholder:text-stone-400'
                placeholder='Search by email address ...'
                ref={searchRef}
                value={snap.emailToSearch}
                onChange={(e) => (store.emailToSearch = e.target.value)}
              />
            </label>
            <button
              className='btn btn-accent ml-2'
              onClick={handleSearch}
              disabled={snap.isSearching || snap.emailToSearch.length === 0}
            >
              {snap.isSearching ? 'Searching...' : 'Search'}
            </button>
          </>
        )}

        {snap.searchDone && snap.user && (
          <>
            <div className='avatar'>
              <div className='w-8 rounded-full'>
                <img src={`/user-image/${snap.user.id}`} />
              </div>
            </div>
            <div className='flex-1'>
              {snap.user.firstName} {snap.user.lastName} ({snap.user.email})
            </div>
          </>
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
