import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

export interface PBEEvent {
  id: string;
  name: string;
}

export interface EventsStore {
  didInit: boolean;
  events: PBEEvent[];
}

export class EventsValt {
  store: EventsStore;

  constructor() {
    this.store = proxy<EventsStore>({
      didInit: false,
      events: []
    });
  }

  async init() {
    const result = await fetch('/api/events');

    if (result.status === 200) {
      this.store.events = await result.json();
      this.store.didInit = true;
    }
  }

  async createEvent(name: string) {
    const result = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const response = await result.json();

    if (response.error) {
      throw new Error(response.error || 'Failed to create event');
    }

    this.store.events.push({ id: response.id, name: response.name });
  }

  async renameEvent(id: string, newName: string) {
    const result = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });

    const response = await result.json();

    if (response.error) {
      throw new Error(response.error || 'Failed to rename event');
    }

    const event = this.store.events.find((e) => e.id === id);

    if (!event) {
      throw new Error('Event not found');
    }

    event.name = newName;
  }

  async deleteEvent(id: string) {
    const result = await fetch(`/api/events/${id}`, {
      method: 'DELETE'
    });

    const response = await result.json();

    if (response.error) {
      throw new Error(response.error || 'Failed to delete event');
    }

    this.store.events = this.store.events.filter((e) => e.id !== id);
  }
}

export const EventsValtContext = createContext<EventsValt>(new EventsValt());

export const useEventsValt = () => {
  return useContext(EventsValtContext);
};
