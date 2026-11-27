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

interface AppStore {
  init: boolean;
  user: User;
}

export class AppValt {
  store: AppStore;

  constructor() {
    this.store = proxy({ init: false } as AppStore);
  }

  async init() {
    const result = await api<{ user: User }>('/api/session');

    if (result.ok) {
      this.store.user = result.data.user;
      this.store.init = true;
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
