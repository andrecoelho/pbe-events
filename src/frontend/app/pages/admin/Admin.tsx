import { useAppValt } from '@/frontend/app/appValt';
import { AdminValt, AdminValtContext } from '@/frontend/app/pages/admin/adminValt';
import { useMemo, type ReactNode } from 'react';
import { useSnapshot } from 'valtio';

// The admin page's sections. Each has its own route in App.tsx; pages inside a section (an event's page) keep
// its tab active.
const TABS = [{ id: 'connections', href: '/admin', label: 'Live connections' }] as const;

export type AdminTab = (typeof TABS)[number]['id'];

const init = () => new AdminValt();

// The admin page's frame: title, tabs and the section's content. Only super admins get past it.
export function AdminLayout({ tab, children }: { tab: AdminTab; children: ReactNode }) {
  const appValt = useAppValt();
  const appSnap = useSnapshot(appValt.store);
  const valt = useMemo(init, []);

  return (
    <div className='bg-base-100/95 flex-1 overflow-auto p-8 pt-4'>
      <h1 className='text-3xl font-bold mb-4'>Admin</h1>
      {appSnap.user.isSuperAdmin ? (
        <AdminValtContext.Provider value={valt}>
          <div role='tablist' className='tabs tabs-border mb-6'>
            {TABS.map((t) => (
              <a key={t.id} role='tab' href={t.href} className={`tab ${t.id === tab ? 'tab-active' : ''}`}>
                {t.label}
              </a>
            ))}
          </div>
          {children}
        </AdminValtContext.Provider>
      ) : (
        <div role='alert' className='alert alert-warning max-w-xl'>
          Only super admins can open the admin page. Ask one to give you access if you need it.
        </div>
      )}
    </div>
  );
}

AdminLayout.displayName = 'AdminLayout';
