import { useAppValt } from '@/frontend/app/appValt';
import { AdminValt, AdminValtContext } from '@/frontend/app/pages/admin/adminValt';
import { useMemo, type ReactNode } from 'react';
import { useSnapshot } from 'valtio';

// The admin page's sections. Each has its own route in App.tsx; pages inside a section (an event's page) keep
// its tab active. Event admins see only the sections not marked superAdminOnly (#89).
const TABS: { id: string; href: string; label: string; superAdminOnly?: boolean }[] = [
  { id: 'connections', href: '/admin', label: 'Live connections' },
  { id: 'users', href: '/admin/users', label: 'Users', superAdminOnly: true },
  { id: 'audit-log', href: '/admin/audit-log', label: 'Audit log', superAdminOnly: true }
];

export type AdminTab = 'connections' | 'users' | 'audit-log';

const init = () => new AdminValt();

// The admin page's frame: title, tabs and the section's content. Super admins and event admins get past it.
export function AdminLayout({ tab, children }: { tab: AdminTab; children: ReactNode }) {
  const superAdminOnly = TABS.find((t) => t.id === tab)?.superAdminOnly;
  const appValt = useAppValt();
  const appSnap = useSnapshot(appValt.store);
  const valt = useMemo(init, []);

  return (
    <div className='bg-base-100/95 flex-1 overflow-auto p-8 pt-4'>
      <h1 className='text-3xl font-bold mb-4'>Admin</h1>
      {appSnap.user.isEventAdmin ? (
        <AdminValtContext.Provider value={valt}>
          <div role='tablist' className='tabs tabs-border mb-6'>
            {TABS.filter((t) => appSnap.user.isSuperAdmin || !t.superAdminOnly).map((t) => (
              <a key={t.id} role='tab' href={t.href} className={`tab ${t.id === tab ? 'tab-active' : ''}`}>
                {t.label}
              </a>
            ))}
          </div>
          {superAdminOnly && !appSnap.user.isSuperAdmin ? (
            <div role='status' className='alert max-w-xl'>
              Only super admins can see this section.
            </div>
          ) : (
            children
          )}
        </AdminValtContext.Provider>
      ) : (
        <div role='status' className='alert max-w-xl'>
          You’re not an admin of any event. This page shows the live connections of the events you own or are an admin
          of.
        </div>
      )}
    </div>
  );
}

AdminLayout.displayName = 'AdminLayout';
