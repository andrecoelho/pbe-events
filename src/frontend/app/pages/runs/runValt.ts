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
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  translations: Array<{ languageCode: string; prompt: string; answer: string; clarification: string }>;
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
  run: Run;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'closed' | 'error';
  items: ActiveItem[];
  currentIndex: number;
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
      items: [],
      currentIndex: -1,
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
    this.store.run = response.run;
    this.store.languages = response.languages;

    // Build items array: title, slides, questions
    const items: ActiveItem[] = [];

    // First item: title
    items.push({
      type: 'title',
      title: 'PATHFINDER BIBLE EXPERIENCE',
      remarks: response.titleRemarks
    });

    // Add slides
    for (const slide of response.slides) {
      items.push({
        type: 'slide',
        number: slide.number,
        content: slide.content
      });
    }

    // Add questions
    for (const question of response.questions) {
      items.push({
        type: 'question',
        id: question.id,
        number: question.number,
        questionType: question.type,
        maxPoints: question.maxPoints,
        phase: 'reading',
        seconds: question.seconds,
        translations: question.translations.map((t) => ({ languageCode: t.languageCode, prompt: t.prompt }))
      });

      items.push({
        type: 'question',
        id: question.id,
        number: question.number,
        questionType: question.type,
        maxPoints: question.maxPoints,
        phase: 'prompt',
        seconds: question.seconds,
        startTime: null,
        translations: question.translations.map((t) => ({ languageCode: t.languageCode, prompt: t.prompt }))
      });

      items.push({
        type: 'question',
        id: question.id,
        number: question.number,
        phase: 'answer',
        translations: question.translations.map((t) => ({
          languageCode: t.languageCode,
          answer: t.answer,
          clarification: t.clarification
        }))
      });
    }

    this.store.items = items;

    // Set current index based on activeItem
    if (response.run.activeItem) {
      const activeItem = response.run.activeItem;

      const index = items.findIndex((item) => {
        if (item.type === 'title' && activeItem.type === 'title') {
          return true;
        }

        if (item.type === 'slide' && activeItem.type === 'slide' && item.number === activeItem.number) {
          return true;
        }

        if (
          item.type === 'question' &&
          activeItem.type === 'question' &&
          item.number === activeItem.number &&
          item.phase === activeItem.phase
        ) {
          return true;
        }

        return false;
      });

      this.store.currentIndex = index !== -1 ? index : 0;
    } else {
      this.store.currentIndex = 0;
    }

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
      // Start at the first item (title)
      this.store.currentIndex = 0;

      const activeItem = this.store.items[0];

      if (activeItem) {
        this.ws?.send(
          JSON.stringify({
            type: 'SET_ACTIVE_ITEM',
            activeItem
          })
        );
      }
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

  next() {
    if (this.store.currentIndex < this.store.items.length - 1) {
      this.store.currentIndex++;

      const nextItem = this.store.items[this.store.currentIndex]!;

      // For questions, update the startTime to current time
      if (nextItem.type === 'question') {
        const updatedItem = { ...nextItem };

        if (updatedItem.phase === 'prompt') {
          updatedItem.startTime = new Date().toISOString();
        }

        this.ws?.send(
          JSON.stringify({
            type: 'SET_ACTIVE_ITEM',
            activeItem: updatedItem
          })
        );
      } else {
        this.ws?.send(
          JSON.stringify({
            type: 'SET_ACTIVE_ITEM',
            activeItem: nextItem
          })
        );
      }
    }
  }

  previous() {
    if (this.store.currentIndex > 0) {
      this.store.currentIndex--;

      const prevItem = this.store.items[this.store.currentIndex]!;

      this.ws?.send(
        JSON.stringify({
          type: 'SET_ACTIVE_ITEM',
          activeItem: prevItem
        })
      );
    }
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
};
