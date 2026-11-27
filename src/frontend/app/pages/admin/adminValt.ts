import { api } from '@/frontend/utils/api';
import type { AdminEventResponse, LiveConnectionsResponse } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

// How often the live data refreshes while the page is open.
const REFRESH_MS = 5000;

// Data read from the server every few seconds.
type Polled<T> = {
  loaded: boolean;
  // Why the last refresh failed, while it keeps failing.
  error: string | null;
  data: T | null;
};

export type AdminStore = {
  connections: Polled<LiveConnectionsResponse>;
  event: Polled<AdminEventResponse>;
};

const empty = () => ({ loaded: false, error: null, data: null });

export class AdminValt {
  store: AdminStore;

  constructor() {
    this.store = proxy<AdminStore>({ connections: empty(), event: empty() });
  }

  private async load<K extends keyof AdminStore>(key: K, path: string) {
    const result = await api<NonNullable<AdminStore[K]['data']>>(path);
    const polled = this.store[key];

    if (result.ok) {
      polled.data = result.data as AdminStore[K]['data'];
      polled.error = null;
    } else {
      polled.error = result.error;
    }

    polled.loaded = true;
  }

  loadConnections = () => this.load('connections', '/api/admin/connections');

  loadEvent = (eventId: string) => this.load('event', `/api/admin/events/${eventId}`);

  // Calls `load` now and every few seconds while the tab is visible. Returns the cleanup, for useEffect.
  poll(load: () => Promise<void>) {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        load();
      }
    };

    load();

    const timer = setInterval(refresh, REFRESH_MS);

    document.addEventListener('visibilitychange', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }
}

export const AdminValtContext = createContext<AdminValt>(new AdminValt());
export const useAdminValt = () => useContext(AdminValtContext);
