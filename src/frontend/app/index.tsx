import { createRoot } from 'react-dom/client';
import { App } from '@/frontend/app/App';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  rootEl.render(<App />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
