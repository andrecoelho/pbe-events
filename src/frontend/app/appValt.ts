import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
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
    const result = await fetch('/api/session');

    if (result.status === 200) {
      const response = (await result.json()) as { user: User };
      this.store.user = response.user;
      this.store.init = true;
    }
  }

  async logout() {
    const result = await fetch('/api/logout', { method: 'POST' });

    if (result.status === 200) {
      window.location.href = '/';
      window.location.reload();

      return { ok: true };
    }

    return { ok: false };
  }
}

export const AppValtContext = createContext<AppValt>(new AppValt());
export const useAppValt = () => useContext(AppValtContext);
