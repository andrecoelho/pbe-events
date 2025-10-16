import { permissionsModal } from '@/frontend/app/pages/permissions/PermissionsModal';
import { PermissionsValt } from '@/frontend/app/pages/permissions/permissionsValt';
import { Icon } from '@/frontend/components/Icon';
import { Loading } from '@/frontend/components/Loading';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Permissions.css';

const init = () => {
  const permissionsValt = new PermissionsValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/permissions\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    permissionsValt.init(eventId);
  }

  return permissionsValt;
};

export function Permissions() {
  const permissionsValt = useMemo(init, []);
  const snap = useSnapshot(permissionsValt.store);

  const handleAddUser = () => {
    permissionsModal.open();
  };

  if (!snap.initialized) {
    return <Loading backgroundColor='bg-base-100' indicatorColor='bg-primary' />;
  }

  return (
    <div className='Permissions bg-base-100 flex-1 relative flex flex-col overflow-auto'>
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
                    <div className='avatar'>
                      <div className='w-8 rounded-full'>
                        <img src={`/user-image/${permission.userId}`} />
                      </div>
                    </div>
                  </td>
                  <td className='col-email'>{permission.email}</td>
                  <td className='col-name'>
                    {permission.firstName} {permission.lastName}
                  </td>
                  <td className='col-role'>
                    <span className='badge badge-success'>{permission.roleId}</span>
                  </td>
                  <td className='col-actions'>
                    {permission.roleId !== 'owner' && (
                      <>
                        <a className='tooltip tooltip-neutral' data-tip='Edit'>
                          <Icon name='pencil-square' className='text-accent' />
                        </a>
                        <a className='tooltip tooltip-neutral' data-tip='Delete'>
                          <Icon name='trash' className='text-error' />
                        </a>
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
        <button className='btn btn-primary' onClick={handleAddUser}>Add User</button>
      </footer>
    </div>
  );
}

Permissions.displayName = 'Permissions';
