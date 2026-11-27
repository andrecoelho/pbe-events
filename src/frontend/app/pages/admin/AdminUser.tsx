import { useAppValt } from '@/frontend/app/appValt';
import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { formatDate } from '@/frontend/app/pages/admin/adminFormat';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import { UserBadges } from '@/frontend/app/pages/admin/Users';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { toast } from '@/frontend/components/Toast';
import { reportFailure } from '@/frontend/utils/api';
import { copyText } from '@/frontend/utils/clipboard';
import { useEffect, useState, type FormEvent } from 'react';
import { useSnapshot } from 'valtio';

// /admin/users/:id
const userIdFromUrl = () => window.location.pathname.match(/^\/admin\/users\/([^/]+)/)?.[1] ?? '';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', judge: 'Judge' };

function UserPage() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.user);
  const me = useSnapshot(useAppValt().store).user;
  const userId = userIdFromUrl();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    valt.openUser(userId);
  }, [valt, userId]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  if (!snap.data) {
    return (
      <div className='flex flex-col gap-4 max-w-4xl'>
        <a className='link link-hover text-sm' href='/admin/users'>
          ← Users
        </a>
        <div role='alert' className='alert alert-error'>
          {snap.error}
        </div>
      </div>
    );
  }

  const { user, events } = snap.data;
  const isMe = user.id === me.id;

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    setSaving(true);

    const result = await valt.saveUser(user.id, {
      firstName: form.get('firstName') as string,
      lastName: form.get('lastName') as string,
      email: form.get('email') as string
    });

    setSaving(false);
    setFormError(result.ok ? null : result.error);

    if (result.ok) {
      toast.show({ type: 'success', message: 'Saved.' });
    }
  };

  const handleResetLink = async () => {
    reportFailure(await valt.createResetLink(user.id));
  };

  const handleCopy = async () => {
    const url = valt.store.user.resetLink?.url ?? '';

    toast.show(
      (await copyText(url))
        ? { type: 'success', message: 'Link copied.' }
        : { type: 'error', message: 'Couldn’t copy. Select the link and copy it by hand.' }
    );
  };

  const handleSignOut = async () => {
    if (
      await confirmModal.open(`Sign ${user.email} out on every device? Their open pages go back to the login page.`)
    ) {
      const result = await valt.userAction(user.id, 'sign-out');

      reportFailure(result);

      if (result.ok) {
        toast.show({ type: 'success', message: 'Signed out everywhere.' });
      }
    }
  };

  const handleDisable = async () => {
    if (
      await confirmModal.open(
        `Disable ${user.email}? They’re signed out everywhere and can’t sign in until the account is enabled again. ` +
          'Their events stay as they are.'
      )
    ) {
      reportFailure(await valt.userAction(user.id, 'disable'));
    }
  };

  const handleEnable = async () => {
    if (await confirmModal.open(`Enable ${user.email} again? They can sign in with their password.`)) {
      reportFailure(await valt.userAction(user.id, 'enable'));
    }
  };

  return (
    <div className='flex flex-col gap-6 max-w-4xl'>
      <div className='flex flex-col gap-2'>
        <a className='link link-hover text-sm' href='/admin/users'>
          ← Users
        </a>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-bold'>{`${user.firstName} ${user.lastName}`.trim() || user.email}</h2>
          <UserBadges user={user} />
        </div>
        <p className='text-sm text-base-content/70'>
          Joined {formatDate(user.createdAt)} · last active{' '}
          {user.lastActiveAt ? formatDate(user.lastActiveAt) : 'unknown'} · signed in on{' '}
          {user.sessionCount === 1 ? '1 device' : `${user.sessionCount} devices`}
          {user.disabledAt && ` · disabled ${formatDate(user.disabledAt)}`}
        </p>
      </div>

      {snap.error && (
        <div role='alert' className='alert alert-error'>
          {snap.error}
        </div>
      )}

      <section className='flex flex-col gap-3'>
        <h3 className='text-lg font-semibold'>Details</h3>
        {/* Keyed by the saved values, so the form shows them again after a save. */}
        <form
          key={`${user.firstName}|${user.lastName}|${user.email}`}
          onSubmit={handleSave}
          className='grid grid-cols-1 md:grid-cols-3 gap-3 items-end'
        >
          <label className='floating-label'>
            <span>First name</span>
            <input
              name='firstName'
              className='input w-full'
              placeholder='First name'
              defaultValue={user.firstName}
              required
            />
          </label>
          <label className='floating-label'>
            <span>Last name</span>
            <input
              name='lastName'
              className='input w-full'
              placeholder='Last name'
              defaultValue={user.lastName}
              required
            />
          </label>
          <label className='floating-label'>
            <span>Email</span>
            <input
              name='email'
              type='email'
              className='input w-full'
              placeholder='Email'
              defaultValue={user.email}
              required
            />
          </label>
          <div className='md:col-span-3 flex items-center gap-3'>
            <button type='submit' className='btn btn-primary btn-sm' disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {formError && <span className='text-error text-sm'>{formError}</span>}
          </div>
        </form>
      </section>

      <section className='flex flex-col gap-3'>
        <h3 className='text-lg font-semibold'>Password</h3>
        <p className='text-sm text-base-content/70'>
          Make a one-time link for them to set a new password, and send it to them yourself. It works for 24 hours, and
          making a new one cancels the last.
        </p>
        <div>
          <button className='btn btn-sm' onClick={handleResetLink}>
            Create a reset link
          </button>
        </div>
        {snap.resetLink && (
          <div className='flex flex-col gap-2'>
            <div className='join w-full'>
              <input
                className='input join-item w-full font-mono text-xs'
                value={snap.resetLink.url}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className='btn join-item' onClick={handleCopy}>
                Copy
              </button>
            </div>
            <p className='text-sm text-base-content/70'>
              Works once, until {formatDate(snap.resetLink.expiresAt, true)}. It’s shown only now: copy it before
              leaving this page.
            </p>
          </div>
        )}
      </section>

      <section className='flex flex-col gap-3'>
        <h3 className='text-lg font-semibold'>Access</h3>
        <div className='flex flex-wrap gap-3'>
          <button className='btn btn-sm' onClick={handleSignOut} disabled={user.sessionCount === 0}>
            Sign out everywhere
          </button>
          {user.disabledAt ? (
            <button className='btn btn-sm btn-success' onClick={handleEnable}>
              Enable account
            </button>
          ) : (
            !isMe && (
              <button className='btn btn-sm btn-error' onClick={handleDisable}>
                Disable account
              </button>
            )
          )}
        </div>
      </section>

      <section className='flex flex-col gap-2'>
        <h3 className='text-lg font-semibold'>Events</h3>
        {events.length === 0 ? (
          <p className='text-base-content/60'>No events.</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='table table-sm'>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <a className='link link-hover' href={`/admin/events/${event.id}`}>
                        {event.name}
                      </a>
                    </td>
                    <td>{ROLE_LABELS[event.role] ?? event.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function AdminUser() {
  return (
    <AdminLayout tab='users'>
      <UserPage />
    </AdminLayout>
  );
}

AdminUser.displayName = 'AdminUser';
