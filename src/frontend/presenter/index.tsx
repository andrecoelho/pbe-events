import { Presenter } from '@/frontend/presenter/Presenter';
import { createRoot } from 'react-dom/client';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  rootEl.render(<Presenter />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
