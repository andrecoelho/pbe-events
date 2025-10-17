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
  }[];
}

export class PermissionsValt {
  store: PermissionsStore;

  constructor() {
    this.store = proxy({ initialized: false } as PermissionsStore);
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/permissions`);
    const response = (await result.json()) as { eventName: string; permissions: PermissionsStore['permissions'] };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.permissions = response.permissions;
    this.store.initialized = true;
  }

  async addPermission(userId: string, roleId: 'admin' | 'judge', email: string, firstName: string, lastName: string) {
    await fetch(`/api/events/${this.store.eventId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleId })
    });

    this.store.permissions.push({ userId, roleId, email, firstName, lastName });
  }
}
