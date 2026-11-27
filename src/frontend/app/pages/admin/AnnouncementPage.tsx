import { AdminLayout } from '@/frontend/app/pages/admin/Admin';
import { useAdminValt } from '@/frontend/app/pages/admin/adminValt';
import { AnnouncementBanner } from '@/frontend/components/AnnouncementBanner';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { toast } from '@/frontend/components/Toast';
import { reportFailure } from '@/frontend/utils/api';
import type { Announcement } from '@/types';
import { useEffect, useState, type FormEvent } from 'react';
import { useSnapshot } from 'valtio';

const MAX_LENGTH = 300;

// ISO → the value of a datetime-local input, in this computer's time zone.
const toLocalInput = (iso: string | null) => {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);

  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// The form, filled from the saved announcement. Keyed by it, so a save or clear starts it over.
function AnnouncementForm({ saved, showing }: { saved: Announcement | null; showing: boolean }) {
  const valt = useAdminValt();
  const [message, setMessage] = useState(saved?.message ?? '');
  const [level, setLevel] = useState<Announcement['level']>(saved?.level ?? 'info');
  const [endsAt, setEndsAt] = useState(toLocalInput(saved?.endsAt ?? null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);

    const result = await valt.saveAnnouncement({
      message,
      level,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null
    });

    setSaving(false);
    setError(result.ok ? null : result.error);

    if (result.ok) {
      toast.show({ type: 'success', message: 'Announcement saved. Open pages show it within 5 minutes.' });
    }
  };

  const handleClear = async () => {
    if (await confirmModal.open('Clear the announcement? It disappears from every page within 5 minutes.')) {
      const result = await valt.clearAnnouncement();

      reportFailure(result);

      if (result.ok) {
        toast.show({ type: 'success', message: 'Announcement cleared.' });
      }
    }
  };

  const preview: Announcement | null = message.trim()
    ? { message: message.trim(), level, endsAt: null, updatedAt: '' }
    : null;

  return (
    <div className='flex flex-col gap-4 max-w-3xl'>
      <p className='text-base-content/70'>
        One message shown at the top of the app and on the sign-in page, for everyone. Not on presenter or team screens.
        People can close it; it shows again if you change it.
      </p>

      <div role='status' className='alert'>
        {!saved
          ? 'No announcement is showing.'
          : !showing
            ? `Hidden: its end time passed (${formatTime(saved.endsAt!)}).`
            : `Showing since ${formatTime(saved.updatedAt)}${saved.endsAt ? `, until ${formatTime(saved.endsAt)}` : ''}.`}
      </div>

      <form onSubmit={handleSave} className='flex flex-col gap-4'>
        <label className='flex flex-col gap-1'>
          <span className='font-semibold'>Message</span>
          <textarea
            className='textarea w-full'
            rows={3}
            maxLength={MAX_LENGTH}
            placeholder='e.g. Maintenance tonight at 10pm: the app will be down for about 15 minutes.'
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            required
          />
          <span className='text-xs text-base-content/60 self-end'>
            {message.length} / {MAX_LENGTH}
          </span>
        </label>

        <div className='flex flex-wrap items-end gap-6'>
          <fieldset className='flex flex-col gap-1'>
            <legend className='font-semibold mb-1'>Kind</legend>
            <div className='flex gap-4'>
              {(['info', 'warning'] as const).map((value) => (
                <label key={value} className='flex items-center gap-2'>
                  <input
                    type='radio'
                    name='level'
                    className={`radio radio-sm ${value === 'warning' ? 'radio-warning' : 'radio-info'}`}
                    checked={level === value}
                    onChange={() => setLevel(value)}
                  />
                  {value === 'info' ? 'Info' : 'Warning'}
                </label>
              ))}
            </div>
          </fieldset>

          <label className='flex flex-col gap-1'>
            <span className='font-semibold'>Hide after (optional)</span>
            <input
              type='datetime-local'
              className='input input-sm'
              value={endsAt}
              onChange={(e) => setEndsAt(e.currentTarget.value)}
            />
          </label>
        </div>

        <div className='flex flex-col gap-1'>
          <span className='font-semibold'>Preview</span>
          {preview ? (
            <div className='rounded-box overflow-hidden border border-base-300'>
              <AnnouncementBanner preview={preview} />
            </div>
          ) : (
            <p className='text-base-content/60'>Write a message to see it here.</p>
          )}
        </div>

        {error && (
          <div role='alert' className='alert alert-error'>
            {error}
          </div>
        )}

        <div className='flex gap-3'>
          <button type='submit' className='btn btn-primary btn-sm' disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Save changes' : 'Show announcement'}
          </button>
          {saved && (
            <button type='button' className='btn btn-sm' onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function AnnouncementSection() {
  const valt = useAdminValt();
  const snap = useSnapshot(valt.store.announcement);

  useEffect(() => {
    valt.loadAnnouncement();
  }, [valt]);

  if (!snap.loaded) {
    return <span className='loading loading-spinner' />;
  }

  if (snap.error) {
    return (
      <div role='alert' className='alert alert-error max-w-xl'>
        Couldn’t load the announcement. {snap.error}
      </div>
    );
  }

  return (
    <AnnouncementForm
      key={snap.data?.updatedAt ?? 'none'}
      saved={snap.data as Announcement | null}
      showing={snap.showing}
    />
  );
}

export function AnnouncementPage() {
  return (
    <AdminLayout tab='announcement'>
      <AnnouncementSection />
    </AdminLayout>
  );
}

AnnouncementPage.displayName = 'AnnouncementPage';
