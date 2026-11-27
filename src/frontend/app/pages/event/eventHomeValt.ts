import { formatJoinCode, joinLink } from '@/joinCode';
import type { EventOverviewResponse } from '@/types';
import { api } from '@/frontend/utils/api';
import { copyText } from '@/frontend/utils/clipboard';
import { proxy } from 'valtio';

interface EventHomeStore {
  overview: EventOverviewResponse | null;
  error: string | null;
}

// How often the page refreshes, so the "Live now" badge follows teams joining and leaving.
export const REFRESH_MS = 15_000;

export class EventHomeValt {
  store: EventHomeStore;

  constructor() {
    this.store = proxy<EventHomeStore>({ overview: null, error: null });
  }

  async load(eventId: string) {
    const result = await api<EventOverviewResponse>(`/api/events/${eventId}/overview`);

    if (result.ok) {
      this.store.overview = result.data;
      this.store.error = null;
    } else if (!this.store.overview) {
      // A failed refresh keeps what's on screen; only the first load shows the error.
      this.store.error = result.error;
    }
  }

  // One line per team: "Team 1 · Eagles: K7P-4QX https://…/join/K7P4QX". Returns the text when the browser
  // refuses to copy, so the page can show it.
  async copyJoinCodes(): Promise<{ ok: true } | { ok: false; text: string }> {
    const teams = this.store.overview?.teams ?? [];
    const text = teams
      .map(
        (team) =>
          `Team ${team.number} · ${team.name}: ${formatJoinCode(team.joinCode)} ${joinLink(window.location.origin, team.joinCode)}`
      )
      .join('\n');

    return (await copyText(text)) ? { ok: true } : { ok: false, text };
  }
}
