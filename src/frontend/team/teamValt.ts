import {
  NOT_CONNECTED,
  WebSocketManager,
  type MessageResult,
  type WebSocketMessage,
  type WebSocketStatus
} from '@/frontend/components/WebSocketManager';
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
  errorMessage?: string;
  // RELEASED when the host released this device from the team.
  errorCode?: string;
  activeItem: ActiveItem | null;
  gracePeriod: number;
  answer: string | null;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages?: Record<string, { id: string; code: string; name: string }>;
  connectionState: WebSocketStatus;
}

type WebSocketTeamMessage =
  | (WebSocketMessage & { type: 'CONNECTION_ERROR'; message: string; code?: 'NOT_JOINED' | 'RELEASED' })
  | (WebSocketMessage & { type: 'EVENT_INFO'; event: { id: string; name: string } })
  | (WebSocketMessage & {
      type: 'TEAM_INFO';
      team: { id: string; name: string; languageId: string; languageCode: string };
    })
  | (WebSocketMessage & { type: 'RUN_STATUS'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' })
  | (WebSocketMessage & { type: 'ACTIVE_ITEM'; activeItem: ActiveItem | null })
  | (WebSocketMessage & { type: 'LANGUAGES'; languages: Record<string, { id: string; code: string; name: string }> })
  | (WebSocketMessage & { type: 'GRACE_PERIOD'; gracePeriod: number })
  | (WebSocketMessage & { type: 'ANSWER_CHALLENGE'; questionId: string; challenged: boolean });

export class TeamValt {
  store: TeamStore;
  private ws: WebSocketManager<WebSocketTeamMessage> | null = null;

  constructor() {
    this.store = proxy({
      activeItem: null,
      answer: null,
      gracePeriod: 0,
      runStatus: 'not_started',
      connectionState: 'init'
    });
  }

  connect = () => {
    this.store.errorMessage = undefined;

    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      // The server knows the team (and event) from the device's cookie, set when it joined with the code.
      wsUrl.search = new URLSearchParams({ role: 'team' }).toString();

      this.ws = new WebSocketManager<WebSocketTeamMessage>(wsUrl.toString(), this.onStatusChange, this.onMessage);

      this.ws.connect();
    }
  };

  cleanup = () => {
    this.ws?.destroy();
    this.ws = null;
  };

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;

    if (status === 'error') {
      this.cleanup();
    }
  };

  onMessage = (message: WebSocketTeamMessage) => {
    switch (message.type) {
      case 'CONNECTION_ERROR':
        this.cleanup();

        // This device hasn't joined a team (or its token is gone): join with the code.
        if (message.code === 'NOT_JOINED') {
          window.location.replace('/join');
          return;
        }

        this.store.errorMessage = message.message;
        this.store.errorCode = message.code;
        break;
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

        if (message.activeItem?.type === 'question' && message.activeItem.phase === 'prompt') {
          const savedAnswer = message.activeItem.answers[this.store.team?.id ?? ''];

          if (savedAnswer) {
            this.store.answer = savedAnswer.answerText;
          }
        }

        break;
      case 'LANGUAGES':
        this.store.languages = message.languages;
        break;
      case 'GRACE_PERIOD':
        this.store.gracePeriod = message.gracePeriod;
        break;
    }
  };

  // Answers wait and are resent if the connection drops (#50); only the latest is kept. They name their
  // question, so one sent late can't land on the next question.
  submitAnswer = async (answer: string | boolean): Promise<MessageResult> => {
    const activeItem = this.store.activeItem;

    if (!this.ws || activeItem?.type !== 'question') {
      return NOT_CONNECTED;
    }

    return await this.ws.sendMessage(
      { type: 'SUBMIT_ANSWER', questionId: activeItem.id, answer },
      { queueKey: `answer:${activeItem.id}` }
    );
  };

  submitChallenge = async (challenged: boolean): Promise<MessageResult> => {
    const activeItem = this.store.activeItem;

    if (!this.ws || activeItem?.type !== 'question') {
      return NOT_CONNECTED;
    }

    return await this.ws.sendMessage({
      type: 'SUBMIT_CHALLENGE',
      questionId: activeItem.id,
      challenged
    });
  };
}

export const TeamValtContext = createContext<TeamValt | null>(null);

export const useTeamValt = () => {
  const valt = useContext(TeamValtContext);

  if (!valt) {
    throw new Error('useTeamValt must be used within a TeamValtContext.Provider');
  }

  return valt;
};
