import type { ActiveItem } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface TeamStore {
  event?: {
    id: string;
    name: string;
  };
  team?: {
    id: string;
    name: string;
    languageId: string;
    languageCode: string;
  };
  activeItem: ActiveItem | null;
  isTimeUp: boolean;
  gracePeriod: number;
  answer: string | null;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages?: Record<string, { id: string; code: string; name: string }>;
}

export class TeamValt {
  store: TeamStore;
  private ws: WebSocket | null = null;

  constructor() {
    this.store = proxy({
      activeItem: null,
      answer: null,
      isTimeUp: false,
      gracePeriod: 0,
      runStatus: 'not_started'
    });
  }

  async init(eventId: string | null, teamId: string | null) {
    if (!eventId || !teamId) {
      throw new Error('eventId and teamId are required for TeamValt initialization');
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({ role: 'team', eventId, teamId }).toString();

    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onclose = () => {
      this.ws = null;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as
        | { type: 'EVENT_INFO'; event: { id: string; name: string } }
        | {
            type: 'TEAM_INFO';
            team: { id: string; name: string; languageId: string; languageCode: string };
          }
        | { type: 'RUN_STATUS'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' }
        | { type: 'ACTIVE_ITEM'; activeItem: ActiveItem | null }
        | { type: 'LANGUAGES'; languages: Record<string, { id: string; code: string; name: string }> }
        | { type: 'SAVED_ANSWER'; questionId: string; answer: string }
        | { type: 'GRACE_PERIOD'; gracePeriod: number };

      switch (message.type) {
        case 'EVENT_INFO':
          this.store.event = message.event;
          break;
        case 'TEAM_INFO':
          this.store.team = message.team;
          break;
        case 'RUN_STATUS':
          this.store.runStatus = message.status;

          if (message.status === 'not_started') {
            this.store.activeItem = null;
          }

          break;
        case 'ACTIVE_ITEM':
          this.store.activeItem = message.activeItem;
          this.store.answer = null;

          // Check if grace period has expired
          if (
            message.activeItem?.type === 'question' &&
            message.activeItem.phase === 'prompt' &&
            message.activeItem.startTime
          ) {
            const startTimeMs = new Date(message.activeItem.startTime).getTime();
            const nowMs = Date.now();
            const elapsedSeconds = Math.floor((nowMs - startTimeMs) / 1000);
            const remainingSeconds = message.activeItem.seconds - elapsedSeconds;
            this.store.isTimeUp = remainingSeconds <= -this.store.gracePeriod;
          } else {
            this.store.isTimeUp = false;
          }
          break;
        case 'LANGUAGES':
          this.store.languages = message.languages;
          break;
        case 'GRACE_PERIOD':
          this.store.gracePeriod = message.gracePeriod;
          break;
        case 'SAVED_ANSWER':
          if (
            this.store.activeItem &&
            this.store.activeItem.type === 'question' &&
            this.store.activeItem.id === message.questionId
          ) {
            this.store.answer = message.answer;
          }
          break;
      }
    };
  }

  submitAnswer(answer: string | boolean) {
    this.ws?.send(JSON.stringify({ type: 'SUBMIT_ANSWER', answer }));
  }

  timeUp() {
    this.store.isTimeUp = true;
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
