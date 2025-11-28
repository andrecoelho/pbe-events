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
  reconnectAttempts: number;
  questions: Question[];
  slides: Slide[];
  languages: Map<string, string>;
  teams: Map<string, TeamStatus>;
}

export class RunValt {
  store: RunStore;

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

    return { ok: true } as const;
  }

  async startRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'start' }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (result.status === 200) {
      this.store.run.status = 'in_progress';

      return { ok: true } as const;
    }

    return { ok: false, error: 'Failed to start run' } as const;
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
