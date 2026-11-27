import { toast } from '@/frontend/components/Toast';
import {
  NOT_CONNECTED,
  WebSocketManager,
  type MessageResult,
  type WebSocketStatus
} from '@/frontend/components/WebSocketManager';
import type { ActiveItem, HostClientMessage, ServerMessage } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

export interface TeamStatus {
  id: string;
  number: number;
  name: string;
  // Reconnecting: its connection dropped recently and its page is retrying (#48).
  status: 'offline' | 'reconnecting' | 'connected';
  // When the team was last connected (server time, ms), or null if not since the server started.
  lastSeenAt?: number | null;
  languageCode: string | null;
  // The code the team joins with (#44), and whether a device has joined with it.
  joinCode: string;
  hasDevice: boolean;
}

export interface Question {
  id: string;
  number: number;
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  locked: boolean;
  graded: boolean;
  translations: {
    languageCode: string;
    languageName: string;
    prompt: string;
    answer: string;
    clarification: string;
  }[];
  answers: Record<
    string,
    {
      answerId: string | null;
      answerText: string | null;
      languageCode: string | null;
      teamId: string;
      teamNumber: number;
      points: number | null;
      autoPoints: number | null;
      challenged: boolean | null;
    }
  >;
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
  connectionState: WebSocketStatus;
  items: ActiveItem[];
  currentIndex: number;
  languages: Record<string, { id: string; code: string; name: string }>;
  teams: Record<string, TeamStatus>;
}

export class RunValt {
  store: RunStore;
  private ws: WebSocketManager<HostClientMessage> | null = null;
  tickTimer: number | null = null;

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
      connectionState: 'init',
      items: [],
      currentIndex: -1,
      languages: {},
      teams: {}
    });
  }

  init = async (eventId: string) => {
    await this.loadEventData(eventId);

    this.store.initialized = true;

    if (this.store.items.some((item) => item.type === 'question')) {
      this.connect();
    }

    return { ok: true } as const;
  };

  loadEventData = async (eventId: string) => {
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
      languages: Record<string, { id: string; code: string; name: string }>;
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
        endsAt: null,
        pausedMs: null,
        isTimeUp: false,
        locked: question.locked,
        graded: question.graded,
        translations: question.translations.map((t) => ({ languageCode: t.languageCode, prompt: t.prompt })),
        answers: question.answers
      });

      items.push({
        type: 'question',
        id: question.id,
        number: question.number,
        phase: 'answer',
        locked: question.locked,
        graded: question.graded,
        translations: question.translations.map((t) => ({
          languageCode: t.languageCode,
          answer: t.answer,
          clarification: t.clarification
        })),
        answers: question.answers
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
  };

  connect = () => {
    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      wsUrl.search = new URLSearchParams({ role: 'host', eventId: this.store.eventId }).toString();

      this.ws = new WebSocketManager<HostClientMessage>(wsUrl.toString(), this.onStatusChange, this.onMessage);

      this.ws.connect();
    }
  };

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;
  };

  onMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'RUN_STATUS':
        this.store.run.status = message.status;
        break;
      case 'ACTIVE_ITEM':
        this.handleSET_ACTIVE_ITEM(message.activeItem);
        break;
      case 'TEAM_STATUS':
        this.handleTEAM_STATUS(message.teams);
        break;
      case 'POINTS_UPDATED':
        this.handlePOINTS_UPDATED(message.questionId, message.answerId, message.points);
        break;
      case 'QUESTION_GRADED':
        this.handleQUESTION_GRADED(message.questionId, message.graded);
        break;
      case 'QUESTION_LOCKED':
        this.handleQUESTION_LOCKED(message.questionId, message.locked);
        break;
    }
  };

  cleanup = () => {
    this.ws?.destroy();
  };

  updateRunStatus = async (status: 'not_started' | 'in_progress' | 'paused' | 'completed') => {
    const currentStatus = this.store.run.status;

    await this.send({ type: 'UPDATE_RUN_STATUS', status });

    if (status === 'not_started') {
      await this.loadEventData(this.store.eventId);
    }

    if (status === 'in_progress' && currentStatus === 'not_started') {
      // Start at the first item (title)
      this.store.currentIndex = 0;

      const activeItem = this.store.items[0];

      if (activeItem) {
        await this.send({
          type: 'SET_ACTIVE_ITEM',
          activeItem
        });
      }
    } else if (status === 'completed') {
      const activeItem = this.store.run.activeItem;

      if (activeItem && activeItem.type === 'question') {
        await this.lockQuestion(activeItem.id, true);
      }

      await this.send({
        type: 'SET_ACTIVE_ITEM',
        activeItem: null
      });
    }

    return { ok: true } as const;
  };

  updateGracePeriod = async (gracePeriod: number) => {
    await this.send({
      type: 'UPDATE_GRACE_PERIOD',
      gracePeriod
    });

    this.store.run.gracePeriod = gracePeriod;

    return { ok: true } as const;
  };

  next = async () => {
    if (this.store.currentIndex < this.store.items.length - 1) {
      this.store.currentIndex++;

      const nextItem = { ...this.store.items[this.store.currentIndex]! };

      await this.send({
        type: 'SET_ACTIVE_ITEM',
        activeItem: nextItem
      });
    }
  };

  previous = () => {
    if (this.store.currentIndex > 0) {
      this.store.currentIndex--;

      const prevItem = { ...this.store.items[this.store.currentIndex]! };

      this.send({
        type: 'SET_ACTIVE_ITEM',
        activeItem: prevItem
      });
    }
  };

  removeTimer = async () => {
    await this.send({ type: 'REMOVE_TIMER' });
  };

  startTimer = async () => {
    await this.send({ type: 'START_TIMER' });
  };

  // Sends a host action; when the server refuses it (or the connection is down), says why in a toast.
  private send = async (message: HostClientMessage): Promise<MessageResult> => {
    const result = (await this.ws?.sendMessage(message)) ?? NOT_CONNECTED;

    if (!result.ok) {
      toast.show({ type: 'error', message: result.error });
    }

    return result;
  };

  // Frees the team for another device; the device that held it is disconnected (#44).
  releaseTeamDevice = async (teamId: string) => {
    return await this.send({ type: 'RELEASE_TEAM_DEVICE', teamId });
  };

  // Gives the team a new join code; the old code and link stop working (#44).
  renewJoinCode = async (teamId: string) => {
    return await this.send({ type: 'RENEW_JOIN_CODE', teamId });
  };

  lockQuestion = async (questionId: string, locked: boolean) => {
    await this.send({ type: 'SET_QUESTION_LOCKED', questionId, locked });
  };

  private handleSET_ACTIVE_ITEM = (activeItem: ActiveItem | null) => {
    this.store.run.activeItem = activeItem;

    if (activeItem) {
      if (activeItem.type === 'question' && activeItem.phase !== 'reading') {
        for (const item of this.store.items) {
          if (item.type === 'question' && item.id === activeItem.id && item.phase !== 'reading') {
            item.locked = activeItem.locked;
            item.graded = activeItem.graded;
            item.answers = activeItem.answers;
          }
        }
      }
    }
  };

  // Updates carry only what changed (a team going offline, a new code), so merge them in.
  private handleTEAM_STATUS = (teams: (Partial<TeamStatus> & { id: string })[]) => {
    for (const team of teams) {
      const current = this.store.teams[team.id];

      if (current) {
        Object.assign(current, team);
      } else if (team.number !== undefined) {
        this.store.teams[team.id] = team as TeamStatus;
      }
    }
  };

  private handlePOINTS_UPDATED = (questionId: string, answerId: string, points: number | null) => {
    for (const item of this.store.items) {
      if (item.type !== 'question' || item.phase === 'reading' || item.id !== questionId) {
        continue;
      }

      for (const teamId in item.answers) {
        if (!Object.hasOwn(item.answers, teamId)) {
          continue;
        }

        const answer = item.answers[teamId];

        if (answer?.answerId === answerId) {
          answer.points = points;

          if (item.phase === 'answer') {
            return;
          }

          break;
        }
      }
    }
  };

  private handleQUESTION_GRADED = (questionId: string, graded: boolean) => {
    for (const item of this.store.items) {
      if (item.type !== 'question' || item.phase === 'reading' || item.id !== questionId) {
        continue;
      }

      item.graded = graded;

      if (item.phase === 'answer') {
        break;
      }
    }
  };

  private handleQUESTION_LOCKED = (questionId: string, locked: boolean) => {
    for (const item of this.store.items) {
      if (item.type !== 'question' || item.phase === 'reading' || item.id !== questionId) {
        continue;
      }

      item.locked = locked;

      if (item.phase === 'answer') {
        break;
      }
    }
  };
}

export const RunValtContext = createContext<RunValt | null>(null);

export const useRunValt = () => {
  const valt = useContext(RunValtContext);

  if (!valt) {
    throw new Error('useRunValt must be used within a RunValtContext.Provider');
  }

  return valt;
};
