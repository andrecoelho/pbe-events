import './Teams.css';

import { Icon } from '@/frontend/components/Icon';

export function Teams() {
  return (
    <div className='Teams bg-base-100 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Teams</h1>
        <h2 className='text-2xl font-bold mb-4 text-center text-neutral brightness-75'>PBE 2026 (Sparks)</h2>
        <div className='overflow-x-auto'>
          <table className='table'>
            <thead>
              <tr>
                <th className='col-number'>#</th>
                <th className='col-name'>Name</th>
                <th className='col-actions'>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className='col-number'>1</td>
                <td className='col-name'>High Sierra Wolves</td>
                <td className='col-actions'>
                  <a className='tooltip tooltip-neutral' data-tip='Edit'>
                    <Icon name='pencil-square' className='text-accent' />
                  </a>
                  <a className='tooltip tooltip-neutral' data-tip='Connection Link'>
                    <Icon name='link' className='text-info' />
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

Teams.displayName = 'Teams';
