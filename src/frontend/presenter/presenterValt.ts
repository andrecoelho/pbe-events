import { WebSocketManager, type WebSocketStatus } from '@/frontend/components/WebSocketManager';
import type { ActiveItem, PresenterClientMessage, ServerMessage } from '@/types';
import { proxy } from 'valtio';

interface PresenterStore {
  eventId: string;
  activeItem: ActiveItem | null;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages: Record<string, { id: string; code: string; name: string }>;
  connectionState: WebSocketStatus;
}

export class PresenterValt {
  store: PresenterStore;
  private ws: WebSocketManager<PresenterClientMessage> | null = null;

  constructor() {
    this.store = proxy({
      eventId: '',
      activeItem: null,
      runStatus: 'not_started',
      languages: {},
      connectionState: 'init'
    });
  }

  async init(eventId: string | null) {
    if (!eventId) {
      throw new Error('eventId is required for PresenterValt initialization');
    }

    this.store.eventId = eventId;

    await this.connect();
  }

  async connect() {
    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      wsUrl.search = new URLSearchParams({
        role: 'presenter',
        eventId: this.store.eventId
      }).toString();

      this.ws = new WebSocketManager<PresenterClientMessage>(wsUrl.toString(), this.onStatusChange, this.onMessage);

      this.ws.connect();
    }
  }

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;
  };

  onMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'RUN_STATUS':
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
