import type { ActiveItem } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface PresenterStore {
  eventId: string;
  activeItem: ActiveItem | null;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages: Record<string, string>;
}

export class PresenterValt {
  store: PresenterStore;
  private ws: WebSocket | null = null;

  constructor() {
    this.store = proxy({
      eventId: '',
      activeItem: null,
      runStatus: 'not_started',
      languages: {}
    });
  }

  async init(eventId: string | null) {
    if (!eventId) {
      throw new Error('eventId is required for PresenterValt initialization');
    }

    this.store.eventId = eventId;

    await this.connectWebSocket();
  }

  async connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({
      role: 'presenter',
      eventId: this.store.eventId
    }).toString();

    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onclose = () => {
      this.ws = null;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'RUN_STATUS_CHANGED':
          this.store.runStatus = message.status;

          if (message.status === 'not_started') {
            this.store.activeItem = null;
          }

          break;
        case 'ACTIVE_ITEM':
          this.store.activeItem = message.activeItem;
          break;
        case 'LANGUAGES':
          this.store.languages = message.languages;
          break;
      }
    };
  }

  submitAnswer(answer: string) {
    this.ws?.send(JSON.stringify({ type: 'SUBMIT_ANSWER', answer }));
  }

  selectLanguage(languageId: string) {
    this.ws?.send(JSON.stringify({ type: 'SELECT_LANGUAGE', languageId }));
  }
}
