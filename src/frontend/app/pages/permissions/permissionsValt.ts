import { proxy } from 'valtio';

interface PermissionsStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  permissions: {
    userId: string;
    roleId: 'owner' | 'admin' | 'judge';
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  }[];
}

export class PermissionsValt {
  store: PermissionsStore;

  constructor() {
    this.store = proxy({ initialized: false, eventId: '', eventName: '', permissions: [] });
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/permissions`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load permissions' } as const;
    }

    const response = (await result.json()) as { eventName: string; permissions: PermissionsStore['permissions'] };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.permissions = response.permissions;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async addPermission(userId: string, roleId: 'admin' | 'judge', email: string, firstName: string, lastName: string, avatarUrl?: string) {
    await fetch(`/api/events/${this.store.eventId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId })
    });

    this.store.permissions.push({ userId, roleId, email, firstName, lastName, avatarUrl });
  }

  async updatePermission(userId: string, roleId: 'admin' | 'judge') {
    await fetch(`/api/events/${this.store.eventId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId })
    });

    const permission = this.store.permissions.find((p) => p.userId === userId);
    if (permission) {
      permission.roleId = roleId;
    }
  }

  async deletePermission(userId: string) {
    await fetch(`/api/events/${this.store.eventId}/permissions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    this.store.permissions = this.store.permissions.filter((p) => p.userId !== userId);
  }
}
