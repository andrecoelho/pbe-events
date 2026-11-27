import { Join } from '@/frontend/team/Join';
import { Team } from '@/frontend/team/Team';
import { createRoot } from 'react-dom/client';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  // /join and /join/K7P4QX join a team; /event-run/team is the team's screen.
  rootEl.render(window.location.pathname.startsWith('/join') ? <Join /> : <Team />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
