import { Avatar } from '@/frontend/components/Avatar';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { roleBadgeColors } from '@/frontend/utils/roleColors';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Permissions.css';
import { permissionsModal } from './PermissionsModal';
import { PermissionsValt } from './permissionsValt';

const init = () => {
  const permissionsValt = new PermissionsValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/permissions\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    permissionsValt.init(eventId).then((result) => {
      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    });
  }

  return permissionsValt;
};

export function Permissions() {
  const valt = useMemo(init, []);
  const snap = useSnapshot(valt.store);

  const handleAddUser = () => {
    permissionsModal.open(valt);
  };

  const handleEditUser = (permission: (typeof snap.permissions)[0]) => {
    permissionsModal.open(valt, {
      userId: permission.userId,
      email: permission.email,
      firstName: permission.firstName,
      lastName: permission.lastName,
      avatarUrl: permission.avatarUrl,
      roleId: permission.roleId as 'admin' | 'judge'
    });
  };

  const handleDeleteUser = async (userId: string) => {
    const confirmation = await confirmModal.open('Are you sure you want to delete this user permission?');

    if (confirmation) {
      valt.deletePermission(userId);
    }
  };

  return (
    <div className='Permissions bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Permissions</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>{snap.eventName}</h2>
        <div className='overflow-x-auto'>
          <table className='table'>
            <thead>
              <tr>
                <th className='col-avatar'>A</th>
                <th className='col-email'>Email</th>
                <th className='col-name'>Name</th>
                <th className='col-role'>Role</th>
                <th className='col-actions'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {snap.permissions.map((permission) => (
                <tr key={permission.userId}>
                  <td className='col-avatar'>
                    <Avatar user={permission} size='sm' />
                  </td>
                  <td className='col-email'>{permission.email}</td>
                  <td className='col-name'>
                    {permission.firstName} {permission.lastName}
                  </td>
                  <td className='col-role'>
                    <span className={`badge ${roleBadgeColors[permission.roleId]}`}>{permission.roleId}</span>
                  </td>
                  <td className='col-actions'>
                    {permission.roleId !== 'owner' && (
                      <>
                        <button
                          className='tooltip tooltip-neutral'
                          data-tip='Edit'
                          onClick={() => handleEditUser(permission)}
                          aria-label={`Edit permissions for ${permission.firstName} ${permission.lastName}`}
                        >
                          <Icon name='pencil-square' className='text-accent' />
                        </button>
                        <button
                          className='tooltip tooltip-neutral'
                          data-tip='Delete'
                          onClick={() => handleDeleteUser(permission.userId)}
                          aria-label={`Delete permissions for ${permission.firstName} ${permission.lastName}`}
                        >
                          <Icon name='trash' className='text-error' />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary' disabled={!snap.initialized} onClick={handleAddUser}>
          <Icon name='plus' className='size-4' />
          Add User
        </button>
      </footer>
    </div>
  );
}

Permissions.displayName = 'Permissions';
