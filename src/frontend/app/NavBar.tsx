import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import andre from '@/assets/andre.png';
import logo from '@/assets/favicon.svg';
import { alertModal } from '@/frontend/components/AlertModal';

export const NavBar = memo(() => {
  const handleLogout = async (event: MouseEvent | KeyboardEvent) => {
    if ('key' in event && event.key === 'Tab') {
      return;
    }

    event.preventDefault();

    const result = await fetch('/api/logout', {
      method: 'POST'
    });

    const response = await result.json();

    if (response.ok) {
      window.location.href = '/';
      window.location.reload();
    } else {
      alertModal.open(response.error || 'Logout failed');
    }
  };

  return (
    <div className="navbar bg-base-300 shadow-md z-10">
      <a href="/" className="flex-none">
        <img src={logo} className="h-8" />
      </a>
      <span className="text-2xl font-bold ml-4">Pathfinder Bible Experience</span>
      <div className="flex-1" />
      <div className="flex-none">
        <button
          className="btn btn-ghost btn-circle avatar"
          popoverTarget="NavBar__profile-menu"
          style={{ anchorName: '--profile-menu-anchor' } as CSSProperties}
        >
          <div className="w-10 rounded-full">
            <img src={andre} />
          </div>
        </button>
        <ul
          className="dropdown dropdown-end menu menu-sm bg-base-100 rounded-box z-10 mt-1 w-52 p-2 shadow"
          id="NavBar__profile-menu"
          popover="auto"
          style={{ positionAnchor: '--profile-menu-anchor' } as CSSProperties}
        >
          <li>
            <button>Settings</button>
          </li>
          <li>
            <button onClick={handleLogout} onKeyDown={handleLogout}>Logout</button>
          </li>
        </ul>
      </div>
    </div>
  );
});

NavBar.displayName = 'NavBar';
