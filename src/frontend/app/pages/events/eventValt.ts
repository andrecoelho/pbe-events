import { api } from '@/frontend/utils/api';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

import type { EventListEntry } from '@/types';

export type PBEEvent = EventListEntry;

export interface EventsStore {
  initialized: boolean;
  events: PBEEvent[];
  // The search box's text (#71).
  query: string;
}

export class EventsValt {
  store: EventsStore;

  constructor() {
    this.store = proxy<EventsStore>({
      initialized: false,
      events: [],
      query: ''
    });
  }

  // Loads the list, or reloads it after a change (a new or duplicated event comes back with its counts).
  async init() {
    const result = await api<{ events: PBEEvent[] }>('/api/events');

    if (!result.ok) {
      return { ok: false, error: `Couldn’t load your events. ${result.error}` } as const;
    }

    this.store.events = result.data.events;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  // These throw an Error with a message to show when the server refuses or can't be reached.

  async createEvent(name: string) {
    await this.request('/api/events', { method: 'POST', json: { name } });
    await this.init();
  }

  async renameEvent(id: string, newName: string) {
    await this.request(`/api/events/${id}`, { method: 'PATCH', json: { name: newName } });

    const event = this.store.events.find((e) => e.id === id);

    if (event) {
      event.name = newName;
      this.store.events.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  async deleteEvent(id: string) {
    await this.request(`/api/events/${id}`, { method: 'DELETE' });

    this.store.events = this.store.events.filter((e) => e.id !== id);
  }

  async duplicateEvent(id: string, name: string) {
    await this.request(`/api/events/${id}/duplicate`, { method: 'POST', json: { name } });
    await this.init();
  }

  setQuery(query: string) {
    this.store.query = query;
  }

  private async request<T>(path: string, options: Parameters<typeof api>[1]) {
    const result = await api<T>(path, options);

    if (!result.ok) {
      throw new Error(result.error);
    }

    return result.data;
  }
}

export const EventsValtContext = createContext<EventsValt>(new EventsValt());
export const useEventsValt = () => useContext(EventsValtContext);
