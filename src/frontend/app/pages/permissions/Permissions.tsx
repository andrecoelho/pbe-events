import './Permissions.css';

import { Icon } from '@/frontend/components/Icon';

export function Permissions() {
  return (
    <div className='Permissions bg-base-100 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Permissions</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>PBE 2026 (Sparks)</h2>
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
              <tr>
                <td className='col-avatar'>
                  <div className='avatar'>
                    <div className='w-8 rounded-full'>
                      <img src='/user-image/01998476-de65-7000-b1d3-b830d85c9078' />
                    </div>
                  </div>
                </td>
                <td className='col-email'>andrecoelho@gmail.com</td>
                <td className='col-name'>Andre Coelho</td>
                <td className='col-role'>
                  <span className='badge badge-success'>Owner</span>
                </td>
                <td className='col-actions'>
                  <a className='tooltip tooltip-neutral' data-tip='Edit'>
                    <Icon name='pencil-square' className='text-accent' />
                  </a>
                  <a className='tooltip tooltip-neutral' data-tip='Delete'>
                    <Icon name='trash' className='text-error' />
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary'>Add User</button>
      </footer>
    </div>
  );
}

Permissions.displayName = 'Permissions';
