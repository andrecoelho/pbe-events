import { Team } from '@/frontend/team/Team';
import { createRoot } from 'react-dom/client';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  rootEl.render(<Team />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
