import { proxy } from 'valtio';

interface RunsStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  runs: {
    id: string;
    status: 'not_started' | 'in_progress' | 'completed';
    gracePeriod: number;
    startedAt: string | null;
    hasTimer: boolean;
    activeQuestionId: string | null;
    createdAt: string;
    activeQuestionNumber?: number;
  }[];
}

export class RunsValt {
  store: RunsStore;

  constructor() {
    this.store = proxy({ initialized: false, eventId: '', eventName: '', runs: [] });
  }

  get hasActiveRun(): boolean {
    return this.store.runs.some((run) => run.status !== 'completed');
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/runs`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load runs' } as const;
    }

    const response = (await result.json()) as {
      eventName: string;
      runs: Array<{
        id: string;
        status: 'not_started' | 'in_progress' | 'completed';
        gracePeriod: number;
        startedAt: string | null;
        hasTimer: boolean;
        activeQuestionId: string | null;
        createdAt: string;
        activeQuestionNumber?: number;
      }>;
    };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.runs = response.runs;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  async createRun(gracePeriod: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gracePeriod })
    });

    if (result.status === 200) {
      const response = (await result.json()) as {
        id: string;
        status: 'not_started' | 'in_progress' | 'completed';
        gracePeriod: number;
        startedAt: string | null;
        hasTimer: boolean;
        activeQuestionId: string | null;
        createdAt: string;
      };

      this.store.runs.push(response);
      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async startRun(runId: string) {
    const result = await fetch(`/api/runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' })
    });

    if (result.status === 200) {
      const response = (await result.json()) as { startedAt: string };
      const run = this.store.runs.find((r) => r.id === runId);

      if (run) {
        run.status = 'in_progress';
        run.startedAt = response.startedAt;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async completeRun(runId: string) {
    const result = await fetch(`/api/runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' })
    });

    if (result.status === 200) {
      const run = this.store.runs.find((r) => r.id === runId);

      if (run) {
        run.status = 'completed';
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async updateGracePeriod(runId: string, gracePeriod: number) {
    const result = await fetch(`/api/runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateGracePeriod', gracePeriod })
    });

    if (result.status === 200) {
      const run = this.store.runs.find((r) => r.id === runId);

      if (run) {
        run.gracePeriod = gracePeriod;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  async deleteRun(runId: string) {
    const result = await fetch(`/api/runs/${runId}`, {
      method: 'DELETE'
    });

    if (result.status === 200) {
      this.store.runs = this.store.runs.filter((r) => r.id !== runId);
      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }
}
