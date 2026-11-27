import { api } from '@/frontend/utils/api';
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
    const result = await api('/api/session');

    if (!result.ok) {
      return { ok: false, error: `Couldn’t load the account details. ${result.error}` } as const;
    }

    const response = result.data as { user: User };
    this.store.user = response.user;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async updateProfile(data: { email: string; firstName: string; lastName: string }) {
    this.store.saving = true;

    try {
      const result = await api('/api/users/me', { method: 'PATCH', json: data });

      if (!result.ok) {
        return { ok: false, error: result.error } as const;
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
      const result = await api('/api/users/me/password', { method: 'PATCH', json: data });

      if (!result.ok) {
        return { ok: false, error: result.error } as const;
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

      const result = await api<{ avatarUrl: string }>('/api/users/me/avatar', { method: 'POST', body: formData });

      if (!result.ok) {
        return { ok: false, error: result.error } as const;
      }

      if (this.store.user) {
        // Add cache-busting query param to force reload
        this.store.user.avatarUrl = `${result.data.avatarUrl}?t=${Date.now()}`;
      }

      return { ok: true } as const;
    } finally {
      this.store.uploadingAvatar = false;
    }
  }

  async deleteAvatar() {
    this.store.uploadingAvatar = true;

    try {
      const result = await api('/api/users/me/avatar', { method: 'DELETE' });

      if (!result.ok) {
        return { ok: false, error: result.error } as const;
      }

      if (this.store.user) {
        this.store.user.avatarUrl = undefined;
      }

      return { ok: true } as const;
    } finally {
      this.store.uploadingAvatar = false;
    }
  }

  async deleteAccount() {
    this.store.saving = true;

    try {
      const result = await api('/api/users/me', { method: 'DELETE' });

      if (!result.ok) {
        return { ok: false, error: result.error } as const;
      }

      return { ok: true } as const;
    } finally {
      this.store.saving = false;
    }
  }
}

export const SettingsValtContext = createContext<SettingsValt>(new SettingsValt());
export const useSettingsValt = () => useContext(SettingsValtContext);
