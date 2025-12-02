import type { ActiveItem } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface TeamStore {
  eventId: string;
  team: {
    id: string;
    name: string;
    number: number;
    languageId: string | null;
  };
  activeItem: ActiveItem | null;
  gracePeriod: number;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages: Record<string, { id: string; code: string; name: string }>;
}

export class TeamValt {
  store: TeamStore;
  private ws: WebSocket | null = null;

  constructor() {
    this.store = proxy({
      eventId: '',
      team: { id: '', name: '', number: 0, languageId: null },
      activeItem: null,
      gracePeriod: 0,
      runStatus: 'not_started',
      languages: {}
    });
  }

  async init(eventId: string | null, teamId: string | null) {
    if (!eventId || !teamId) {
      throw new Error('eventId and teamId are required for TeamValt initialization');
    }

    this.store.eventId = eventId;
    this.store.team.id = teamId;

    await this.connectWebSocket();
  }

  async connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({
      role: 'team',
      eventId: this.store.eventId,
      teamId: this.store.team.id
    }).toString();

    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onclose = () => {
      this.ws = null;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'TEAM_INFO':
          this.store.team = message.team;
          break;
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

export const TeamValtContext = createContext<TeamValt | null>(null);

export const useTeamValt = () => {
  const valt = useContext(TeamValtContext);

  if (!valt) {
    throw new Error('useTeamValt must be used within a TeamValtContext.Provider');
  }

  return valt;
};
