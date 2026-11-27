import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { formatDate } from '@/frontend/app/pages/admin/adminFormat';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import { debounce } from '@/frontend/utils/debounce';
import { useEffect, useMemo } from 'react';
import { useSnapshot } from 'valtio';

const openUser = (userId: string) => {
  const href = `/admin/users/${userId}`;

  if (window.navigation) {
    window.navigation.navigate(href);
  } else {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};

// Badges after a user's name: super admin, disabled.
export function UserBadges({ user }: { user: { isSuperAdmin: boolean; disabledAt: string | null } }) {
  return (
    <>
      {user.isSuperAdmin && <span className='badge badge-sm badge-primary'>Super admin</span>}
      {user.disabledAt && <span className='badge badge-sm badge-error'>Disabled</span>}
    </>
  );
}

function UserList() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.users);
  const search = useMemo(() => debounce((query: string) => valt.searchUsers(query), 300), [valt]);

  useEffect(() => {
    valt.searchUsers(valt.store.users.query);
  }, [valt]);

  const users = snap.data?.users ?? [];

  return (
    <div className='flex flex-col gap-4 max-w-6xl'>
      <label className='input w-full max-w-md'>
        <span className='label'>Search</span>
        <input
          type='search'
          placeholder='Email or name'
          defaultValue={snap.query}
          onChange={(e) => search(e.currentTarget.value)}
          autoFocus
        />
      </label>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          Couldn’t search the users. {snap.error}
        </div>
      )}

      {!snap.loaded ? (
        <span className='loading loading-spinner' />
      ) : users.length === 0 ? (
        <p className='text-lg text-base-content/60'>No users match “{snap.query}”.</p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='table table-sm'>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Events</th>
                <th>Signed in on</th>
                <th>Last active</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className='hover:bg-base-200 cursor-pointer' onClick={() => openUser(user.id)}>
                  <td>
                    <span className='flex flex-wrap items-center gap-2'>
                      <a
                        className='link link-hover font-semibold'
                        href={`/admin/users/${user.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {`${user.firstName} ${user.lastName}`.trim() || '—'}
                      </a>
                      <UserBadges user={user} />
                    </span>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.eventCount}</td>
                  <td>{user.sessionCount === 1 ? '1 device' : `${user.sessionCount} devices`}</td>
                  <td className='whitespace-nowrap'>{user.lastActiveAt ? formatDate(user.lastActiveAt) : '—'}</td>
                  <td className='whitespace-nowrap'>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snap.data?.more && (
        <p className='text-sm text-base-content/70'>Showing the first 50 matches. Search to narrow them down.</p>
      )}
    </div>
  );
}

export function Users() {
  return (
    <AdminLayout tab='users'>
      <UserList />
    </AdminLayout>
  );
}

Users.displayName = 'Users';
