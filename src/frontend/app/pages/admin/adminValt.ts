import { api } from '@/frontend/utils/api';
import type { LiveConnectionsResponse, LiveEvent } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

// How often the live connections refresh while the page is open.
const REFRESH_MS = 5000;

export type AdminStore = {
  connections: {
    loaded: boolean;
    // Why the last refresh failed, while it keeps failing.
    error: string | null;
    // The server's clock when the list was read, so ages don't depend on this computer's clock.
    serverTime: number;
    events: LiveEvent[];
  };
};

export class AdminValt {
  store: AdminStore;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store = proxy<AdminStore>({ connections: { loaded: false, error: null, serverTime: 0, events: [] } });
  }

  async loadConnections() {
    const result = await api<LiveConnectionsResponse>('/api/admin/connections');
    const connections = this.store.connections;

    if (result.ok) {
      connections.serverTime = result.data.serverTime;
      connections.events = result.data.events;
      connections.error = null;
    } else {
      connections.error = result.error;
    }

    connections.loaded = true;
  }

  // Refreshes the live connections every few seconds while the tab is visible. Returns the cleanup.
  watchConnections = () => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        this.loadConnections();
      }
    };

    this.loadConnections();
    this.timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      if (this.timer) {
        clearInterval(this.timer);
      }

      document.removeEventListener('visibilitychange', refresh);
    };
  };
}

export const AdminValtContext = createContext<AdminValt>(new AdminValt());
export const useAdminValt = () => useContext(AdminValtContext);
