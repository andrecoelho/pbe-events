import '../base.css';

import { NavBar } from '@/frontend/app/NavBar';
import { Events } from '@/frontend/app/pages/events/Events';
import { useRouter, type Routes } from '@/frontend/utils/useRouter';

const routes: Routes = new Map([[/^\/$/, Events]]);

export function App() {
  const Page = useRouter(routes);

  return (
    <div className='absolute inset-0 flex flex-col'>
      <NavBar />
      <Page />
    </div>
  );
}
