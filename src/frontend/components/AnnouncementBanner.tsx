import { Icon } from '@/frontend/components/Icon';
import { api } from '@/frontend/utils/api';
import type { Announcement } from '@/types';
import { useEffect, useState } from 'react';

// How often an open page checks for a new announcement.
const REFRESH_MS = 5 * 60_000;

// The announcement a person closed, by its updatedAt: a changed message shows again.
const DISMISSED_KEY = 'pbe:dismissedAnnouncement';

// The announcement banner (#62), as shown at the top of the app and on the sign-in page. `preview` shows that
// announcement instead of fetching (the admin page), and can't be dismissed.
export function AnnouncementBanner({ preview }: { preview?: Announcement | null }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY));

  useEffect(() => {
    if (preview !== undefined) {
      return;
    }

    const load = async () => {
      const result = await api<{ announcement: Announcement | null }>('/api/announcement');

      // A failed check keeps whatever is showing.
      if (result.ok) {
        setAnnouncement(result.data.announcement);
      }
    };

    load();

    const timer = setInterval(load, REFRESH_MS);

    return () => clearInterval(timer);
  }, [preview]);

  const shown = preview === undefined ? announcement : preview;

  if (!shown || (preview === undefined && dismissed === shown.updatedAt)) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, shown.updatedAt);
    setDismissed(shown.updatedAt);
  };

  return (
    <div
      role={shown.level === 'warning' ? 'alert' : 'status'}
      className={`alert ${shown.level === 'warning' ? 'alert-warning' : 'alert-info'} rounded-none justify-center py-2 z-10`}
    >
      <Icon name={shown.level === 'warning' ? 'exclamation-triangle' : 'information-circle'} className='size-5' />
      <span className='whitespace-pre-line'>{shown.message}</span>
      {preview === undefined && (
        <button
          className='btn btn-ghost btn-xs btn-circle'
          onClick={handleDismiss}
          aria-label='Dismiss the announcement'
        >
          <Icon name='x-mark' className='size-4' />
        </button>
      )}
    </div>
  );
}

AnnouncementBanner.displayName = 'AnnouncementBanner';
