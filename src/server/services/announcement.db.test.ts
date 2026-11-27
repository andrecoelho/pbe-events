// The announcement banner (#62) against a real database. Runs only when POSTGRES_URL is a local dev database;
// CI has none, so it skips there. It clears the local announcement when done.
import {
  clearAnnouncement,
  currentAnnouncement,
  getAnnouncement,
  saveAnnouncement
} from '@/server/services/announcement';
import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from 'bun';

function isLocalDatabase() {
  try {
    const url = new URL(process.env.POSTGRES_URL ?? '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['15432', '15433'].includes(url.port);
  } catch {
    return false;
  }
}

afterAll(async () => {
  if (isLocalDatabase()) {
    await clearAnnouncement();
  }
});

describe.skipIf(!isLocalDatabase())('announcement', () => {
  test('saved, replaced, hidden once its time is up, and cleared, with the cache following each change', async () => {
    await clearAnnouncement();
    expect(await currentAnnouncement()).toBeNull();

    await saveAnnouncement({ message: 'First', level: 'info', endsAt: null }, 'test');
    expect(await currentAnnouncement()).toMatchObject({ message: 'First', level: 'info', endsAt: null });

    const later = new Date(Date.now() + 3600_000).toISOString();

    await saveAnnouncement({ message: 'Second', level: 'warning', endsAt: later }, 'test');
    expect(await currentAnnouncement()).toMatchObject({ message: 'Second', level: 'warning', endsAt: later });
    expect((await sql`SELECT count(*)::int AS n FROM announcement`)[0].n).toBe(1);

    await saveAnnouncement(
      { message: 'Past', level: 'info', endsAt: new Date(Date.now() - 1000).toISOString() },
      'test'
    );
    expect(await currentAnnouncement()).toBeNull();
    expect((await getAnnouncement())?.message).toBe('Past');

    await clearAnnouncement();
    expect(await getAnnouncement()).toBeNull();
  });
});
