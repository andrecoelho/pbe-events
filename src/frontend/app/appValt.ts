import { api } from '@/frontend/utils/api';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  // Sees every event on the admin page (/admin), and its other sections.
  isSuperAdmin: boolean;
  // Owner or admin of an event (or a super admin): the admin page shows their events' live connections (#89).
  isEventAdmin: boolean;
}

export type EventRoleId = 'owner' | 'admin' | 'judge';

// The event whose workspace is open (#15), kept across its sections so the menu doesn't flicker.
export interface CurrentEvent {
  id: string;
  name: string;
  roleId: EventRoleId;
}

interface AppStore {
  init: boolean;
  user: User;
  currentEvent: CurrentEvent | null;
  // Why an event couldn't be loaded (no access, or no connection).
  currentEventError: { eventId: string; message: string } | null;
}

export class AppValt {
  store: AppStore;
  // The event loadEvent() was last asked for, so an older answer can't replace a newer one.
  private requestedEventId: string | null = null;

  constructor() {
    this.store = proxy({ init: false, currentEvent: null, currentEventError: null } as unknown as AppStore);
  }

  async init() {
    const result = await api<{ user: User }>('/api/session');

    if (result.ok) {
      this.store.user = result.data.user;
      this.store.init = true;
    }
  }

  // Loads the event's name and the user's role on it. Keeps showing the event already loaded while it refreshes.
  async loadEvent(eventId: string) {
    if (this.store.currentEvent?.id !== eventId) {
      this.store.currentEvent = null;
    }

    this.store.currentEventError = null;
    this.requestedEventId = eventId;

    const result = await api<CurrentEvent>(`/api/events/${eventId}`);

    if (this.requestedEventId !== eventId) {
      return;
    }

    if (result.ok) {
      this.store.currentEvent = result.data;
    } else {
      this.store.currentEvent = null;
      this.store.currentEventError = {
        eventId,
        message: result.status === 403 ? 'You don’t have access to this event.' : result.error
      };
    }
  }

  async logout() {
    const result = await api('/api/logout', { method: 'POST' });

    if (result.ok) {
      window.location.href = '/';
      window.location.reload();
    }

    return result;
  }
}

export const AppValtContext = createContext<AppValt>(new AppValt());
export const useAppValt = () => useContext(AppValtContext);
