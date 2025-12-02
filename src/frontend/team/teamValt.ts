import type { ActiveItem } from '@/types';
import { proxy } from 'valtio';

interface TeamStore {
  eventId: string;
  teamId: string;
  activeItem: ActiveItem | null;
  gracePeriod: number;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  answer: { id: string; answer: string } | null;
  answerShown: { languageCode: string; answer: string; clarification: string | null }[] | null;
}

export class TeamValt {
  store: TeamStore;
  private ws: WebSocket | null = null;

  constructor(eventId: string, teamId: string) {
    this.store = proxy({
      eventId,
      teamId,
      activeItem: null,
      gracePeriod: 0,
      runStatus: 'not_started',
      answer: null,
      answerShown: null
    });
  }

  async init() {
    await this.connectWebSocket();
  }

  async connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({
      role: 'team',
      eventId: this.store.eventId,
      teamId: this.store.teamId
    }).toString();

    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onerror = () => {};
    this.ws.onopen = () => {};

    this.ws.onclose = () => {
      this.ws = null;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'ACTIVE_ITEM_CHANGED':
          this.store.activeItem = message.activeItem;
          if (message.gracePeriod !== undefined) {
            this.store.gracePeriod = message.gracePeriod;
          }
          // Clear previous answer state when active item changes
          this.store.answer = null;
          this.store.answerShown = null;
          break;
        case 'ANSWER_SHOWN':
          this.store.answerShown = message.translations;
          break;
        case 'QUESTION_ENDED':
          if (this.store.activeItem?.type === 'question') {
            this.store.activeItem = { ...this.store.activeItem, phase: 'ended' };
          }
          break;
        case 'YOUR_ANSWER':
          this.store.answer = { id: message.answerId, answer: message.answer };
          break;
        case 'RUN_STATUS_CHANGED':
          this.store.runStatus = message.status;

          if (message.status === 'not_started') {
            this.store.activeItem = null;
            this.store.answer = null;
            this.store.answerShown = null;
          }

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
