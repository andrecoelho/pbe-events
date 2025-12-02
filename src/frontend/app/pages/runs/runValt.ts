import type { ActiveItem } from '@/types';
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
  questionId: string;
  number: number;
  type: string;
  maxPoints: number;
  seconds: number;
}

export interface Slide {
  slideId: string;
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

    const response = (await result.json()) as { eventName: string; run: Run };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.run = response.run;
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
          | { type: 'ACTIVE_ITEM'; activeItem: ActiveItem }
          | { type: 'TEAM_STATUS'; teams: TeamStatus[] }
          | { type: 'TEAM_DISCONNECTED'; teamId: string };

        switch (message.type) {
          case 'ACTIVE_ITEM':
            this.handleACTIVE_ITEM(message.activeItem);
            break;
          case 'TEAM_STATUS':
            this.handleTEAM_STATUS(message.teams);
            break;
          case 'TEAM_DISCONNECTED':
            this.handleTEAM_DISCONNECTED(message.teamId);
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
    this.store.run.status = status;

    return { ok: true } as const;
  }

  async updateGracePeriod(gracePeriod: number) {
    this.ws?.send(JSON.stringify({ type: 'UPDATE_GRACE_PERIOD', gracePeriod }));
    this.store.run.gracePeriod = gracePeriod;
    return { ok: true } as const;
  }

  handleACTIVE_ITEM(activeItem: ActiveItem) {
    this.store.run.activeItem = activeItem;
  }

  handleTEAM_STATUS(teams: TeamStatus[]) {
    for (const team of teams) {
      this.store.teams[team.id] = team;
    }
  }

  handleTEAM_DISCONNECTED(teamId: string) {
    this.store.teams[teamId]!.status = 'offline';
  }
}
