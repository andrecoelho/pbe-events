import { createRoot } from 'react-dom/client';
import { AnnouncementBanner } from '@/frontend/components/AnnouncementBanner';
import { Login } from '@/frontend/login/Login';
import { ResetPassword } from '@/frontend/login/ResetPassword';
import '../base.css';

function start() {
  const rootEl = createRoot(document.getElementById('root')!);

  const resetToken = window.location.pathname.match(/^\/reset-password\/([^/]+)/)?.[1];

  rootEl.render(
    <>
      {resetToken ? <ResetPassword token={resetToken} /> : <Login />}
      <div className='absolute top-0 inset-x-0'>
        <AnnouncementBanner />
      </div>
    </>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
