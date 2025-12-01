import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface SettingsStore {
  initialized: boolean;
  user: User | null;
  saving: boolean;
  uploadingAvatar: boolean;
}

export class SettingsValt {
  store: SettingsStore;

  constructor() {
    this.store = proxy<SettingsStore>({
      initialized: false,
      user: null,
      saving: false,
      uploadingAvatar: false
    });
  }

  async init() {
    const result = await fetch('/api/session');

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load user data' } as const;
    }

    const response = (await result.json()) as { user: User };
    this.store.user = response.user;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async updateProfile(data: { email: string; firstName: string; lastName: string }) {
    this.store.saving = true;

    try {
      const result = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const response = await result.json();

      if (response.error) {
        return { ok: false, error: response.error } as const;
      }

      if (this.store.user) {
        this.store.user.email = data.email;
        this.store.user.firstName = data.firstName;
        this.store.user.lastName = data.lastName;
      }

      return { ok: true } as const;
    } finally {
      this.store.saving = false;
    }
  }

  async updatePassword(data: { currentPassword: string; newPassword: string }) {
    this.store.saving = true;

    try {
      const result = await fetch('/api/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const response = await result.json();

      if (response.error) {
        return { ok: false, error: response.error } as const;
      }

      return { ok: true } as const;
    } finally {
      this.store.saving = false;
    }
  }

  async uploadAvatar(file: File) {
    this.store.uploadingAvatar = true;

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const result = await fetch('/api/users/me/avatar', {
        method: 'POST',
        body: formData
      });

      const response = await result.json();

      if (response.error) {
        return { ok: false, error: response.error } as const;
      }

      if (this.store.user) {
        // Add cache-busting query param to force reload
        this.store.user.avatarUrl = `${response.avatarUrl}?t=${Date.now()}`;
      }

      return { ok: true } as const;
    } finally {
      this.store.uploadingAvatar = false;
    }
  }

  async deleteAvatar() {
    this.store.uploadingAvatar = true;

    try {
      const result = await fetch('/api/users/me/avatar', {
        method: 'DELETE'
      });

      const response = await result.json();

      if (response.error) {
        return { ok: false, error: response.error } as const;
      }

      if (this.store.user) {
        this.store.user.avatarUrl = undefined;
      }

      return { ok: true } as const;
    } finally {
      this.store.uploadingAvatar = false;
    }
  }
}

export const SettingsValtContext = createContext<SettingsValt>(new SettingsValt());
export const useSettingsValt = () => useContext(SettingsValtContext);
