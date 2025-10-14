import { createRoot } from 'react-dom/client';
import { Login } from '@/frontend/login/Login';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  rootEl.render(<Login />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
