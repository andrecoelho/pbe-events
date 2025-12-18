import { WebSocketManager, type WebSocketMessage, type WebSocketStatus } from '@/frontend/components/WebSocketManager';
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
  connectionState: WebSocketStatus;
}

type WebSocketTeamMessage =
  | (WebSocketMessage & { type: 'EVENT_INFO'; event: { id: string; name: string } })
  | (WebSocketMessage & {
      type: 'TEAM_INFO';
      team: { id: string; name: string; languageId: string; languageCode: string };
    })
  | (WebSocketMessage & { type: 'RUN_STATUS'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' })
  | (WebSocketMessage & { type: 'ACTIVE_ITEM'; activeItem: ActiveItem | null })
  | (WebSocketMessage & { type: 'LANGUAGES'; languages: Record<string, { id: string; code: string; name: string }> })
  | (WebSocketMessage & { type: 'SAVED_ANSWER'; questionId: string; answer: string })
  | (WebSocketMessage & { type: 'GRACE_PERIOD'; gracePeriod: number });

export class TeamValt {
  store: TeamStore;
  eventId: string;
  teamId: string;
  private ws: WebSocketManager<WebSocketTeamMessage> | null = null;

  constructor(eventId: string | null, teamId: string | null) {
    this.store = proxy({
      activeItem: null,
      answer: null,
      isTimeUp: false,
      gracePeriod: 0,
      runStatus: 'not_started',
      connectionState: 'init'
    });

    this.eventId = eventId || '';
    this.teamId = teamId || '';
  }

  connect = () => {
    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      wsUrl.search = new URLSearchParams({ role: 'team', eventId: this.eventId, teamId: this.teamId }).toString();

      this.ws = new WebSocketManager<WebSocketTeamMessage>(wsUrl.toString(), this.onStatusChange, this.onMessage);

      this.ws.connect();
    }
  };

  cleanup = () => {
    this.ws?.destroy();
  };

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;
  };

  onMessage = (message: WebSocketTeamMessage) => {
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

  submitAnswer = async (answer: string | boolean) => {
    return !this.ws ? false : await this.ws?.sendMessage({ type: 'SUBMIT_ANSWER', answer });
  };

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
