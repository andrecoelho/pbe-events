import type { ActiveItem } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

const MAX_RECONNECT_ATTEMPTS = 5;

export interface TeamStatus {
  id: string;
  name: string;
  number: number;
  status: 'offline' | 'connected' | 'ready';
  languageCode: string | null;
  hasAnswer: boolean;
}

export interface Question {
  id: string;
  number: number;
  type: string;
  maxPoints: number;
  seconds: number;
  translations: Array<{ languageCode: string; prompt: string }>;
}

export interface Slide {
  id: string;
  number: number;
  content: string;
}

interface Run {
  status: 'not_started' | 'in_progress' | 'paused' | 'completed';
  gracePeriod: number;
  activeItem: ActiveItem | null;
}

interface RunStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  titleRemarks: string | null;
  run: Run;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'closed' | 'error';
  questions: Question[];
  slides: Slide[];
  languages: Record<string, string>;
  teams: Record<string, TeamStatus>;
}

export class RunValt {
  store: RunStore;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.store = proxy({
      initialized: false,
      eventId: '',
      eventName: '',
      titleRemarks: null,
      run: {
        status: 'not_started',
        gracePeriod: 0,
        activeItem: null
      },
      connectionState: 'disconnected',
      reconnectAttempts: 0,
      questions: [],
      slides: [],
      languages: {},
      teams: {}
    });
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/run`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load run data' } as const;
    }

    const response = (await result.json()) as {
      eventName: string;
      titleRemarks: string | null;
      run: Run;
      questions: Question[];
      slides: Slide[];
      languages: Record<string, string>;
    };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.titleRemarks = response.titleRemarks;
    this.store.run = response.run;
    this.store.questions = response.questions;
    this.store.slides = response.slides;
    this.store.languages = response.languages;
    this.store.initialized = true;

    return await this.connectWebSocket();
  }

  connectWebSocket = () => {
    const { promise, resolve, reject } = Promise.withResolvers<{ ok: true } | { ok: false; error: string }>();

    if (this.ws?.readyState === WebSocket.OPEN) {
      resolve({ ok: true } as const);
      return promise;
    }

    this.store.connectionState = 'connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({ role: 'host', eventId: this.store.eventId }).toString();

    try {
      const ws = new WebSocket(wsUrl.toString());

      ws.onopen = () => {
        this.ws = ws;
        this.store.connectionState = 'connected';
        this.reconnectAttempts = 0;

        resolve({ ok: true } as const);
      };

      ws.onclose = () => {
        this.store.connectionState = 'closed';
        this.ws = null;
      };

      ws.onerror = () => {
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.pow(2, this.reconnectAttempts) * 1000;

          this.reconnectAttempts++;

          this.reconnectTimeout = setTimeout(this.connectWebSocket, delay);
        } else {
          this.store.connectionState = 'error';
          reject({ ok: false, error: 'WebSocket connection failed' } as const);
        }
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as
          | { type: 'RUN_STATUS_CHANGED'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' }
          | { type: 'ACTIVE_ITEM'; activeItem: ActiveItem }
          | { type: 'TEAM_STATUS'; teams: TeamStatus[] }
          | { type: 'TEAM_DISCONNECTED'; teamId: string };

        switch (message.type) {
          case 'RUN_STATUS_CHANGED':
            this.store.run.status = message.status;
            break;
          case 'ACTIVE_ITEM':
            this.store.run.activeItem = message.activeItem;
            break;
          case 'TEAM_STATUS':
            this.handleTEAM_STATUS(message.teams);
            break;
          case 'TEAM_DISCONNECTED':
            if (this.store.teams[message.teamId]) {
              this.store.teams[message.teamId]!.status = 'offline';
            }

            break;
        }
      };
    } catch (error) {
      this.store.connectionState = 'error';
      reject({ ok: false, error: 'WebSocket connection failed' } as const);
    }

    return promise;
  };

  disconnectWebSocket() {
    this.ws?.close();
  }

  async updateRunStatus(status: 'not_started' | 'in_progress' | 'paused' | 'completed') {
    this.ws?.send(JSON.stringify({ type: 'UPDATE_RUN_STATUS', status }));

    if (this.store.run.status === 'not_started' && status === 'in_progress') {
      this.ws?.send(
        JSON.stringify({
          type: 'SET_ACTIVE_ITEM',
          activeItem: {
            type: 'title',
            title: 'PATHFINDER BIBLE EXPERIENCE',
            remarks: this.store.titleRemarks
          }
        })
      );
    } else if (status === 'completed') {
      this.ws?.send(
        JSON.stringify({
          type: 'SET_ACTIVE_ITEM',
          activeItem: null
        })
      );
    }

    return { ok: true } as const;
  }

  private handleTEAM_STATUS(teams: TeamStatus[]) {
    for (const team of teams) {
      this.store.teams[team.id] = team;
    }
  }
}

export const RunValtContext = createContext<RunValt | null>(null);

export const useRunValt = () => {
  const valt = useContext(RunValtContext);

  if (!valt) {
    throw new Error('useRunValt must be used within a RunValtContext.Provider');
  }

  return valt;
}
