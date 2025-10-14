import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Login } from '@/frontend/login/Login';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  rootEl.render(
    <StrictMode>
      <Login />
    </StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
