import '../base.css';

import { AppValt, AppValtContext } from '@/frontend/app/appValt';
import { NavBar } from '@/frontend/app/NavBar';
import { Events } from '@/frontend/app/pages/events/Events';
import { Permissions } from '@/frontend/app/pages/permissions/Permissions';
import { Teams } from '@/frontend/app/pages/teams/Teams';
import { Loading } from '@/frontend/components/Loading';
import { useRouter, type Routes } from '@/frontend/utils/useRouter';
import { useMemo, type ElementType } from 'react';
import { useSnapshot } from 'valtio';

const routes: Routes = new Map([
  [/^\/permissions/, Permissions],
  [/^\/teams/, Teams],
  [/^\/$/, Events]
] as [RegExp, ElementType][]);

const init = () => {
  const appValt = new AppValt();

  appValt.init();

  return appValt;
};

export function App() {
  const appValt = useMemo(init, []);
  const snap = useSnapshot(appValt.store);
  const Page = useRouter(routes);

  if (!snap.init) {
    return <Loading />;
  }

  return (
    <AppValtContext.Provider value={appValt}>
      <div className='absolute inset-0 flex flex-col'>
        <NavBar />
        <Page />
      </div>
    </AppValtContext.Provider>
  );
}

App.displayName = 'App';
