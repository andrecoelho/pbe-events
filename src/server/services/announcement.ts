// The announcement banner (#62): one row, read on every page load, so it's cached in memory (one server process)
// and the cache is replaced on every change.
import { sql } from 'bun';
import type { Announcement } from '@/types';

type Row = { message: string; level: Announcement['level']; ends_at: Date | null; updated_at: Date };

let cached: Promise<Announcement | null> | null = null;

const toAnnouncement = (row: Row): Announcement => ({
  message: row.message,
  level: row.level,
  endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
  updatedAt: new Date(row.updated_at).toISOString()
});

// The announcement as saved, even when its time is up (the admin page shows it).
export function getAnnouncement(): Promise<Announcement | null> {
  cached ??= sql`SELECT message, level, ends_at, updated_at FROM announcement`.then((rows: Row[]) =>
    rows[0] ? toAnnouncement(rows[0]) : null
  );

  // Don't keep a failed read.
  cached.catch(() => {
    cached = null;
  });

  return cached;
}

// The announcement to show now: null when there's none or its time is up.
export async function currentAnnouncement() {
  const announcement = await getAnnouncement();

  return announcement && (!announcement.endsAt || Date.parse(announcement.endsAt) > Date.now()) ? announcement : null;
}

export async function saveAnnouncement(
  announcement: { message: string; level: Announcement['level']; endsAt: string | null },
  userId: string
) {
  await sql`
    INSERT INTO announcement (id, message, level, ends_at, updated_at, updated_by)
    VALUES (true, ${announcement.message}, ${announcement.level}, ${announcement.endsAt}, CURRENT_TIMESTAMP, ${userId})
    ON CONFLICT (id) DO UPDATE SET
      message = EXCLUDED.message, level = EXCLUDED.level, ends_at = EXCLUDED.ends_at,
      updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
  `;
  cached = null;
}

export async function clearAnnouncement() {
  await sql`DELETE FROM announcement`;
  cached = null;
}
