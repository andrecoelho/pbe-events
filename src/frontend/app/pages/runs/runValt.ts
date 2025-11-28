import { proxy } from 'valtio';

const MAX_RECONNECT_ATTEMPTS = 5;

export interface TeamStatus {
  teamId: string;
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
  activeQuestion?: {
    id: string;
    number: number;
    type: string;
    maxPoints: number;
    seconds: number;
  };
  activeSlide?: {
    id: string;
    number: number;
    content: string;
  };
}

interface RunStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  run: Run;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'closed' | 'error';
  questions: Question[];
  slides: Slide[];
  languages: Map<string, string>;
  teams: Map<string, TeamStatus>;
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
        gracePeriod: 0
      },
      connectionState: 'disconnected',
      reconnectAttempts: 0,
      questions: [],
      slides: [],
      languages: new Map(),
      teams: new Map()
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

    if (this.store.run?.status === 'in_progress' || this.store.run?.status === 'paused') {
      return await this.connectWebSocket();
    }

    return { ok: true } as const;
  }

  connectWebSocket = () => {
    const { promise, resolve, reject } = Promise.withResolvers<{ ok: true } | { ok: false; error: string }>();

    if (this.ws?.readyState === WebSocket.OPEN) {
      resolve({ ok: true } as const);
      return promise;
    }

    this.store.connectionState = 'connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/event-run/ws?role=host&eventId=${this.store.eventId}&teamId=host`;

    try {
      const ws = new WebSocket(wsUrl);

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
    } catch (error) {
      this.store.connectionState = 'error';
      reject({ ok: false, error: 'WebSocket connection failed' } as const);
    }

    return promise;
  };

  async startRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'start' }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to start run' } as const;
    }

    this.store.run.status = 'in_progress';

    return await this.connectWebSocket();
  }

  async pauseRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'pause' }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (result.status === 200) {
      this.store.run.status = 'paused';

      return { ok: true } as const;
    }

    return { ok: false, error: 'Failed to pause run' } as const;
  }

  async resumeRun() {
    this.ws?.send(JSON.stringify({ type: 'RESUME_RUN' }));
    this.store.run.status = 'in_progress';
    return { ok: true } as const;
  }

  async completeRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'complete' }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (result.status === 200) {
      this.store.run.status = 'completed';

      return { ok: true } as const;
    }

    return { ok: false, error: 'Failed to complete run' } as const;
  }

  async updateGracePeriod(gracePeriod: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'updateGracePeriod', gracePeriod }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (result.status === 200) {
      this.store.run.gracePeriod = gracePeriod;

      return { ok: true } as const;
    }

    return { ok: false, error: 'Failed to update grace period' } as const;
  }

  async resetRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reset' }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (result.status === 200) {
      this.store.run.status = 'not_started';
      this.store.run.activeQuestion = undefined;
      this.store.run.activeSlide = undefined;

      return { ok: true } as const;
    }

    return { ok: false, error: 'Failed to reset run' } as const;
  }
}
