import '../base.css';

import type { ElementType } from 'react';

import { NavBar } from '@/frontend/app/NavBar';
import { Events } from '@/frontend/app/pages/events/Events';
import { Permissions } from '@/frontend/app/pages/permissions/Permissions';
import { useRouter, type Routes } from '@/frontend/utils/useRouter';

const routes: Routes = new Map([
  [/^\/permissions/, Permissions],
  [/^\/$/, Events]
] as [RegExp, ElementType][]);

export function App() {
  const Page = useRouter(routes);

  return (
    <div className='absolute inset-0 flex flex-col'>
      <NavBar />
      <Page />
    </div>
  );
}

App.displayName = 'App';
