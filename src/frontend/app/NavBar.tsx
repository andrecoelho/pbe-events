import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

import logo from '@/assets/favicon.svg';
import { useAppValt } from '@/frontend/app/appValt';
import { alertModal } from '@/frontend/components/AlertModal';
import { Avatar } from '@/frontend/components/Avatar';
import { useSnapshot } from 'valtio';

export const NavBar = memo(() => {
  const appValt = useAppValt();
  const snap = useSnapshot(appValt.store);

  const handleLogout = async (event: MouseEvent | KeyboardEvent) => {
    if ('key' in event && event.key === 'Tab') {
      return;
    }

    event.preventDefault();

    const result = await appValt.logout();

    if (!result.ok) {
      alertModal.open('Logout failed');
    }
  };

  return (
    <div className='navbar bg-base-300 shadow-md z-10'>
      <a href='/' className='flex-none'>
        <img src={logo} className='h-8' />
      </a>
      <span className='text-2xl font-bold ml-4'>Pathfinder Bible Experience</span>
      <div className='flex-1' />
      <div className='flex-none'>
        <button
          className='btn btn-ghost btn-circle'
          popoverTarget='NavBar__profile-menu'
          style={{ anchorName: '--profile-menu-anchor' } as CSSProperties}
        >
          <Avatar user={snap.user} size='md' />
        </button>
        <ul
          className='dropdown dropdown-end menu menu-sm bg-base-100 rounded-box z-10 mt-1 w-52 p-2 shadow'
          id='NavBar__profile-menu'
          popover='auto'
          style={{ positionAnchor: '--profile-menu-anchor' } as CSSProperties}
        >
          <li>
            <a href='/settings'>Settings</a>
          </li>
          <li>
            <button onClick={handleLogout} onKeyDown={handleLogout}>
              Logout
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
});

NavBar.displayName = 'NavBar';
