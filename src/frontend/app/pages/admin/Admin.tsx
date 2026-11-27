import { useAppValt } from '@/frontend/app/appValt';
import { AdminValt, AdminValtContext } from '@/frontend/app/pages/admin/adminValt';
import { LiveConnections } from '@/frontend/app/pages/admin/LiveConnections';
import { useMemo, type ElementType } from 'react';
import { useSnapshot } from 'valtio';

// The admin page's sections, each at /admin/<path>. The first is the default.
const TABS: { path: string; label: string; page: ElementType }[] = [
  { path: 'connections', label: 'Live connections', page: LiveConnections }
];

const init = () => new AdminValt();

export function Admin() {
  const appValt = useAppValt();
  const appSnap = useSnapshot(appValt.store);
  const valt = useMemo(init, []);
  const segment = window.location.pathname.split('/')[2];
  const tab = TABS.find((t) => t.path === segment) ?? TABS[0]!;
  const Page = tab.page;

  if (!appSnap.user.isSuperAdmin) {
    return (
      <div className='bg-base-100/95 flex-1 overflow-auto p-8 pt-4'>
        <h1 className='text-3xl font-bold mb-4'>Admin</h1>
        <div role='alert' className='alert alert-warning max-w-xl'>
          Only super admins can open the admin page. Ask one to give you access if you need it.
        </div>
      </div>
    );
  }

  return (
    <AdminValtContext.Provider value={valt}>
      <div className='bg-base-100/95 flex-1 overflow-auto p-8 pt-4'>
        <h1 className='text-3xl font-bold mb-4'>Admin</h1>
        <div role='tablist' className='tabs tabs-border mb-6'>
          {TABS.map((t) => (
            <a key={t.path} role='tab' href={`/admin/${t.path}`} className={`tab ${t === tab ? 'tab-active' : ''}`}>
              {t.label}
            </a>
          ))}
        </div>
        <Page />
      </div>
    </AdminValtContext.Provider>
  );
}

Admin.displayName = 'Admin';
