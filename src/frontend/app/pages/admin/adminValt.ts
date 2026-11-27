import { api, type Outcome } from '@/frontend/utils/api';
import type { AdminEventResponse, AuditLogEntry, AuditLogResponse, LiveConnectionsResponse } from '@/types';
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
  auditLog: {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    entries: AuditLogEntry[];
    // Where the next (older) page starts; null when there's none.
    nextBefore: string | null;
  };
};

const empty = () => ({ loaded: false, error: null, data: null });

export class AdminValt {
  store: AdminStore;

  constructor() {
    this.store = proxy<AdminStore>({
      connections: empty(),
      event: empty(),
      auditLog: { loaded: false, loading: false, error: null, entries: [], nextBefore: null }
    });
  }

  private async load<K extends 'connections' | 'event'>(key: K, path: string) {
    const result = await api<NonNullable<AdminStore[K]['data']>>(path);
    const polled = this.store[key];

    if (result.ok) {
      polled.data = result.data as AdminStore[K]['data'];
      polled.error = null;
    } else if (result.status === 403 && key === 'event') {
      polled.error = 'You can only see the events you own or are an admin of.';
    } else {
      polled.error = result.error;
    }

    polled.loaded = true;
  }

  loadConnections = () => this.load('connections', '/api/admin/connections');

  loadEvent = (eventId: string) => this.load('event', `/api/admin/events/${eventId}`);

  // The audit log's newest page, or with `more` the next older one (#61).
  async loadAuditLog(more = false) {
    const log = this.store.auditLog;
    const query = more && log.nextBefore ? `?before=${encodeURIComponent(log.nextBefore)}` : '';

    log.loading = true;

    const result = await api<AuditLogResponse>(`/api/admin/audit-log${query}`);

    if (result.ok) {
      log.entries = more ? [...log.entries, ...result.data.entries] : result.data.entries;
      log.nextBefore = result.data.nextBefore;
      log.error = null;
    } else {
      log.error = result.error;
    }

    log.loaded = true;
    log.loading = false;
  }

  // Drops the event's in-memory state; its pages reconnect and reload it (#57).
  async resetEvent(eventId: string): Promise<Outcome> {
    const result = await api(`/api/admin/events/${eventId}/reset`, { method: 'POST' });

    await this.loadEvent(eventId);

    return result.ok ? { ok: true } : result;
  }

  // Frees the team for another device (#57).
  async releaseDevice(eventId: string, teamId: string): Promise<Outcome> {
    const result = await api(`/api/admin/events/${eventId}/teams/${teamId}/release`, { method: 'POST' });

    await this.loadEvent(eventId);

    return result.ok ? { ok: true } : result;
  }

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
