import { api, type Outcome } from '@/frontend/utils/api';
import type {
  AdminEventResponse,
  AdminEventsResponse,
  AdminUserResponse,
  AdminUsersResponse,
  Announcement,
  AuditLogEntry,
  AuditLogResponse,
  HealthResponse,
  LiveConnectionsResponse,
  ResetLinkResponse
} from '@/types';
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
  health: Polled<HealthResponse>;
  // The announcement as saved (#62); `data` is null when there's none.
  announcement: { loaded: boolean; error: string | null; data: Announcement | null; showing: boolean };
  auditLog: {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    entries: AuditLogEntry[];
    // Where the next (older) page starts; null when there's none.
    nextBefore: string | null;
  };
  users: { query: string; loaded: boolean; error: string | null; data: AdminUsersResponse | null };
  events: { query: string; loaded: boolean; error: string | null; data: AdminEventsResponse | null };
  user: {
    loaded: boolean;
    error: string | null;
    data: AdminUserResponse | null;
    // The last reset link made on this page, shown until the page changes (the server keeps only its hash).
    resetLink: { url: string; expiresAt: string } | null;
  };
};

const empty = () => ({ loaded: false, error: null, data: null });

export class AdminValt {
  store: AdminStore;

  constructor() {
    this.store = proxy<AdminStore>({
      connections: empty(),
      event: empty(),
      health: empty(),
      announcement: { loaded: false, error: null, data: null, showing: false },
      auditLog: { loaded: false, loading: false, error: null, entries: [], nextBefore: null },
      users: { query: '', loaded: false, error: null, data: null },
      events: { query: '', loaded: false, error: null, data: null },
      user: { loaded: false, error: null, data: null, resetLink: null }
    });
  }

  private async load<K extends 'connections' | 'event' | 'health'>(key: K, path: string) {
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

  async loadAnnouncement() {
    const store = this.store.announcement;
    const result = await api<{ announcement: Announcement | null; showing: boolean }>('/api/admin/announcement');

    if (result.ok) {
      store.data = result.data.announcement;
      store.showing = result.data.showing;
      store.error = null;
    } else {
      store.error = result.error;
    }

    store.loaded = true;
  }

  async saveAnnouncement(announcement: Pick<Announcement, 'message' | 'level' | 'endsAt'>): Promise<Outcome> {
    const result = await api<{ announcement: Announcement }>('/api/admin/announcement', {
      method: 'PUT',
      json: announcement
    });

    if (!result.ok) {
      return result;
    }

    this.store.announcement.data = result.data.announcement;
    this.store.announcement.showing = true;

    return { ok: true };
  }

  async clearAnnouncement(): Promise<Outcome> {
    const result = await api('/api/admin/announcement', { method: 'DELETE' });

    if (!result.ok) {
      return result;
    }

    this.store.announcement.data = null;
    this.store.announcement.showing = false;

    return { ok: true };
  }

  loadHealth = () => this.load('health', '/api/admin/health');

  loadEvent = (eventId: string) => this.load('event', `/api/admin/events/${eventId}`);

  // Events matching the search (#59). Only the latest search's answer is kept.
  async searchEvents(query: string) {
    const events = this.store.events;

    events.query = query;

    const result = await api<AdminEventsResponse>(`/api/admin/events?q=${encodeURIComponent(query)}`);

    if (events.query !== query) {
      return;
    }

    if (result.ok) {
      events.data = result.data;
      events.error = null;
    } else {
      events.error = result.error;
    }

    events.loaded = true;
  }

  // Join or leave the event as a super admin, or transfer its ownership (#59); then the event again.
  async manageEvent(eventId: string, action: 'join' | 'leave' | 'transfer', email?: string): Promise<Outcome> {
    const result = await api(`/api/admin/events/${eventId}/${action}`, {
      method: 'POST',
      json: action === 'transfer' ? { email } : undefined
    });

    await this.loadEvent(eventId);

    return result.ok ? { ok: true } : result;
  }

  // Users matching the search (#58). Only the latest search's answer is kept.
  async searchUsers(query: string) {
    const users = this.store.users;

    users.query = query;

    const result = await api<AdminUsersResponse>(`/api/admin/users?q=${encodeURIComponent(query)}`);

    if (users.query !== query) {
      return;
    }

    if (result.ok) {
      users.data = result.data;
      users.error = null;
    } else {
      users.error = result.error;
    }

    users.loaded = true;
  }

  // The user's page opened: forget the last page's reset link.
  openUser(userId: string) {
    this.store.user.resetLink = null;

    return this.loadUser(userId);
  }

  async loadUser(userId: string) {
    const user = this.store.user;
    const result = await api<AdminUserResponse>(`/api/admin/users/${userId}`);

    if (result.ok) {
      user.data = result.data;
      user.error = null;
    } else {
      user.error = result.error;
    }

    user.loaded = true;
  }

  async saveUser(userId: string, details: { email: string; firstName: string; lastName: string }): Promise<Outcome> {
    const result = await api(`/api/admin/users/${userId}`, { method: 'PATCH', json: details });

    if (result.ok) {
      await this.loadUser(userId);
    }

    return result.ok ? { ok: true } : result;
  }

  // A user action (sign-out, disable, enable), then the user again.
  async userAction(userId: string, action: 'sign-out' | 'disable' | 'enable'): Promise<Outcome> {
    const result = await api(`/api/admin/users/${userId}/${action}`, { method: 'POST' });

    await this.loadUser(userId);

    return result.ok ? { ok: true } : result;
  }

  async createResetLink(userId: string): Promise<Outcome> {
    const result = await api<ResetLinkResponse>(`/api/admin/users/${userId}/reset-link`, { method: 'POST' });

    if (!result.ok) {
      return result;
    }

    this.store.user.resetLink = {
      url: `${window.location.origin}${result.data.path}`,
      expiresAt: result.data.expiresAt
    };

    return { ok: true };
  }

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
