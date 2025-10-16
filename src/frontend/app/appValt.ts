import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
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
    const response = (await result.json()) as { user: User };
    this.store.user = response.user;
    this.store.init = true;
  }
}

export const AppValtContext = createContext<AppValt>(new AppValt());
export const useAppValt = () => useContext(AppValtContext);
