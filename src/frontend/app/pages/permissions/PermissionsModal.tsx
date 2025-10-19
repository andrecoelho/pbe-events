import { Icon } from '@/frontend/components/Icon';
import { modal } from '@/frontend/components/Modal';
import { useMemo, type CSSProperties } from 'react';
import { proxy, useSnapshot } from 'valtio';
import type { PermissionsValt } from './permissionsValt';

interface Props {
  user?: User;
  permissionsValt: PermissionsValt;
}

interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId?: 'admin' | 'judge';
}

interface Store {
  user?: User;
  searchCriteria: string;
  searchStatus: 'idle' | 'searching' | 'done';
}

const init = (permissionsValt: PermissionsValt, user?: User) => {
  const uniqueId = crypto.randomUUID();
  const popoverId = `role-popover-${uniqueId}`;
  const anchorName = `--role-anchor-${uniqueId}`;

  const store = proxy<Store>({ user, searchCriteria: '', searchStatus: user ? 'done' : 'idle' });

  const searchUserByEmail = async (email: string) => {
    store.searchStatus = 'searching';

    const result = await fetch(`/api/users?email=${encodeURIComponent(email)}`);

    store.searchStatus = 'done';

    if (result.status === 200) {
      const response = (await result.json()) as { user: { id: string; firstName: string; lastName: string } };

      store.user = {
        userId: response.user.id,
        email,
        firstName: response.user.firstName,
        lastName: response.user.lastName
      };

      return true;
    } else if (result.status === 404) {
      store.user = undefined;
    }

    store.searchStatus = 'done';

    return false;
  };

  const handleCancel = () => permissionsModal.close();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.searchStatus = 'idle';
    store.searchCriteria = e.target.value;
  };

  const handleSearch = () => {
    searchUserByEmail(store.searchCriteria);
  };

  const handleRemoveUser = () => {
    store.user = undefined;
    store.searchCriteria = '';
    store.searchStatus = 'idle';
  };

  const handleChooseRole = (e: React.MouseEvent<HTMLButtonElement>) => {
    const role = e.currentTarget.dataset.role as 'admin' | 'judge' | undefined;
    const popover = document.getElementById(popoverId);

    store.user!.roleId = role;

    popover?.hidePopover();
  };

  const handleSave = async () => {
    if (store.user && store.user.roleId) {
      const userExists = permissionsValt.store.permissions.find((p) => p.userId === store.user!.userId);

      if (userExists) {
        await permissionsValt.updatePermission(store.user.userId, store.user.roleId);
      } else {
        await permissionsValt.addPermission(
          store.user.userId,
          store.user.roleId,
          store.user.email,
          store.user.firstName,
          store.user.lastName
        );
      }

      permissionsModal.close();
    }
  };

  return {
    store,
    popoverId,
    anchorName,
    handleCancel,
    handleChange,
    handleSearch,
    handleRemoveUser,
    handleChooseRole,
    handleSave
  };
};

function PermissionsModal(props: Props) {
  const {
    store,
    popoverId,
    anchorName,
    handleCancel,
    handleChange,
    handleSearch,
    handleRemoveUser,
    handleChooseRole,
    handleSave
  } = useMemo(() => init(props.permissionsValt, props.user), [props.permissionsValt]);

  const snap = useSnapshot(store);
  const isValid = snap.user?.roleId !== undefined;

  return (
    <div className='modal-box w-[600px] max-w-[600px]'>
      <h3 className='font-bold text-lg mb-4'>{props.user ? 'Edit User' : 'Add User'}</h3>
      <div className='flex flex-col gap-2 items-center'>
        {!props.user && (snap.searchStatus !== 'done' || (snap.searchStatus === 'done' && !snap.user)) && (
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
                  value={snap.searchCriteria}
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
              disabled={snap.searchStatus === 'searching' || snap.searchCriteria.length === 0}
            >
              {snap.searchStatus === 'searching' ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}

        {snap.searchStatus === 'done' && snap.user && (
          <div className='flex gap-4 w-full items-center'>
            <div className='avatar'>
              <div className='w-8 rounded-full'>
                <img src={`/user-image/${snap.user.userId}`} />
              </div>
            </div>
            <div className='flex-1'>
              {snap.user.firstName} {snap.user.lastName} ({snap.user.email})
            </div>
            <div className='flex-none w-36'>
              <button
                className='btn btn-outline w-full'
                popoverTarget={popoverId}
                style={{ anchorName } as CSSProperties}
              >
                {snap.user.roleId ? (
                  <span className={`badge badge-${snap.user.roleId === 'admin' ? 'info' : 'accent'}`}>
                    {snap.user.roleId}
                  </span>
                ) : (
                  <span>
                    Choose Role
                    <Icon name='chevron-down' className='size-4 inline-block ml-1' />
                  </span>
                )}
              </button>

              <ul
                className='dropdown menu w-32 rounded-box bg-base-100 shadow-sm'
                popover='auto'
                id={popoverId}
                style={{ positionAnchor: anchorName } as CSSProperties}
              >
                <li>
                  <button data-role='admin' onClick={handleChooseRole}>
                    <span className='badge badge-info'>admin</span>
                  </button>
                </li>
                <li>
                  <button data-role='judge' onClick={handleChooseRole}>
                    <span className='badge badge-accent'>judge</span>
                  </button>
                </li>
              </ul>
            </div>
            {!props.user && (
              <div>
                <a className='tooltip tooltip-neutral' data-tip='Delete' onClick={handleRemoveUser}>
                  <Icon name='trash' className='text-error size-6 cursor-pointer hover:brightness-75' />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled={!isValid} onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}

PermissionsModal.displayName = 'PermissionsModal';

class PermissionsModalManager {
  open = async (permissionsValt: PermissionsValt, user?: User) => {
    return await modal.open(<PermissionsModal permissionsValt={permissionsValt} user={user} />);
  };

  close = () => {
    modal.close();
  };
}

export const permissionsModal = new PermissionsModalManager();
