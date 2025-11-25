import { proxy } from 'valtio';

interface HostStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  run: {
    eventId: string;
    status: 'not_started' | 'in_progress' | 'completed';
    gracePeriod: number;
    hasTimer: boolean;
    activeQuestionId: string | null;
    questionStartTime: string | null;
    activeQuestion?: {
      id: string;
      number: number;
      type: string;
      maxPoints: number;
      seconds: number;
    };
  } | null;
}

export class HostValt {
  store: HostStore;

  constructor() {
    this.store = proxy({ initialized: false, eventId: '', eventName: '', run: null });
  }

  async init(eventId: string) {
    // Get event name
    const eventResult = await fetch(`/api/events`);

    if (eventResult.status !== 200) {
      return { ok: false, error: 'Failed to load event' } as const;
    }

    const eventsResponse = (await eventResult.json()) as {
      events: Array<{ id: string; name: string; role_id: string }>;
    };

    const event = eventsResponse.events.find((e) => e.id === eventId);

    if (!event) {
      return { ok: false, error: 'Event not found' } as const;
    }

    // Get run
    const runResult = await fetch(`/api/events/${eventId}/run`);

    if (runResult.status !== 200) {
      return { ok: false, error: 'Failed to load run' } as const;
    }

    const runResponse = (await runResult.json()) as {
      run: {
        eventId: string;
        status: 'not_started' | 'in_progress' | 'completed';
        gracePeriod: number;
        hasTimer: boolean;
        activeQuestionId: string | null;
        questionStartTime: string | null;
        activeQuestion?: {
          id: string;
          number: number;
          type: string;
          maxPoints: number;
          seconds: number;
        };
      };
    };

    this.store.eventId = eventId;
    this.store.eventName = event.name;
    this.store.run = runResponse.run;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async startRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.status = 'in_progress';
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async completeRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.status = 'completed';
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async updateGracePeriod(gracePeriod: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateGracePeriod', gracePeriod })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.gracePeriod = gracePeriod;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async resetRun() {
    const result = await fetch(`/api/events/${this.store.eventId}/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });

    if (result.status === 200) {
      if (this.store.run) {
        this.store.run.status = 'not_started';
        this.store.run.activeQuestionId = null;
        this.store.run.questionStartTime = null;
        this.store.run.activeQuestion = undefined;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }
}
