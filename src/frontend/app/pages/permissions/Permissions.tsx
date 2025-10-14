import './Permissions.css';

import andre from '@/assets/andre.png';
import delberth from '@/assets/delberth.png';
import victor from '@/assets/victor.png';
import { Icon } from '@/frontend/components/Icon';

export function Permissions() {
  return (
    <div className='Permissions bg-base-100 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'></div>
      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary'>Add User</button>
      </footer>
    </div>
  );
}

Permissions.displayName = 'Permissions';
