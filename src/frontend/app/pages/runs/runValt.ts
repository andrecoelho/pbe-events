import { WebSocketManager, type WebSocketMessage, type WebSocketStatus } from '@/frontend/components/WebSocketManager';
import type { ActiveItem } from '@/types';
import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

export interface TeamStatus {
  id: string;
  number: number;
  status: 'offline' | 'connected' | 'ready';
  languageCode: string | null;
}

export interface Question {
  id: string;
  number: number;
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
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

type AnswerReceivedMessage = WebSocketMessage & {
  type: 'ANSWER_RECEIVED';
  teamId: string;
  teamNumber: number;
  questionId: string;
  translationId: string;
  languageCode: string;
  answerId: string;
  answerText: string;
  challenged: boolean;
};

type WebSocketRunMessage =
  | (WebSocketMessage & { type: 'RUN_STATUS'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' })
  | (WebSocketMessage & { type: 'ACTIVE_ITEM'; activeItem: ActiveItem })
  | (WebSocketMessage & { type: 'TEAM_STATUS'; teams: TeamStatus[] })
  | AnswerReceivedMessage
  | (WebSocketMessage & { type: 'ANSWER_CHALLENGE'; questionId: string; teamId: string; challenged: boolean });

export class RunValt {
  store: RunStore;
  private ws: WebSocketManager<WebSocketRunMessage> | null = null;

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
        startTime: null,
        translations: question.translations.map((t) => ({ languageCode: t.languageCode, prompt: t.prompt })),
        answers: question.answers
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

    this.store.initialized = true;

    this.connect();

    return { ok: true } as const;
  };

  connect = () => {
    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      wsUrl.search = new URLSearchParams({ role: 'host', eventId: this.store.eventId }).toString();

      this.ws = new WebSocketManager<WebSocketRunMessage>(wsUrl.toString(), this.onStatusChange, this.onMessage);

      this.ws.connect();
    }
  };

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;
  };

  onMessage = (message: WebSocketRunMessage) => {
    switch (message.type) {
      case 'RUN_STATUS':
        this.store.run.status = message.status;
        break;
      case 'ACTIVE_ITEM':
        this.store.run.activeItem = message.activeItem;
        break;
      case 'TEAM_STATUS':
        this.handleTEAM_STATUS(message.teams);
        break;
      case 'ANSWER_RECEIVED':
        this.handleANSWER_RECEIVED(message);
        break;
      case 'ANSWER_CHALLENGE':
        this.handleANSWER_CHALLENGE(message);
        break;
    }
  };

  cleanup = () => {
    this.ws?.destroy();
  };

  updateRunStatus = async (status: 'not_started' | 'in_progress' | 'paused' | 'completed') => {
    this.ws?.sendMessage({ type: 'UPDATE_RUN_STATUS', status });

    if (this.store.run.status === 'not_started' && status === 'in_progress') {
      // Start at the first item (title)
      this.store.currentIndex = 0;

      const activeItem = this.store.items[0];

      if (activeItem) {
        this.ws?.sendMessage({
          type: 'SET_ACTIVE_ITEM',
          activeItem
        });
      }
    } else if (status === 'completed') {
      this.ws?.sendMessage({
        type: 'SET_ACTIVE_ITEM',
        activeItem: null
      });
    }

    return { ok: true } as const;
  };

  updateGracePeriod = async (gracePeriod: number) => {
    this.ws?.sendMessage({
      type: 'UPDATE_GRACE_PERIOD',
      gracePeriod
    });

    this.store.run.gracePeriod = gracePeriod;

    return { ok: true } as const;
  };

  next = () => {
    if (this.store.currentIndex < this.store.items.length - 1) {
      this.store.currentIndex++;

      const nextItem = { ...this.store.items[this.store.currentIndex]! };

      // For questions, update the startTime to current time
      if (nextItem.type === 'question' && nextItem.phase === 'prompt') {
        nextItem.startTime = new Date().toISOString();
      }

      this.ws?.sendMessage({
        type: 'SET_ACTIVE_ITEM',
        activeItem: nextItem
      });
    }
  };

  previous = () => {
    if (this.store.currentIndex > 0) {
      this.store.currentIndex--;

      const prevItem = { ...this.store.items[this.store.currentIndex]! };

      this.ws?.sendMessage({
        type: 'SET_ACTIVE_ITEM',
        activeItem: prevItem
      });
    }
  };

  removeTimer = () => {
    this.ws?.sendMessage({
      type: 'SET_ACTIVE_ITEM',
      activeItem: this.store.items[this.store.currentIndex]
    });
  };

  restartTimer = () => {
    const item = this.store.items[this.store.currentIndex];

    if (item && item.type === 'question' && item.phase === 'prompt') {
      this.ws?.sendMessage({
        type: 'SET_ACTIVE_ITEM',
        activeItem: { ...item, startTime: new Date().toISOString() }
      });
    }
  };

  private handleTEAM_STATUS = (teams: TeamStatus[]) => {
    for (const team of teams) {
      this.store.teams[team.id] = team;
    }
  };

  private handleANSWER_RECEIVED = (message: AnswerReceivedMessage) => {
    const answerReceived = {
      answerId: message.answerId,
      answerText: message.answerText,
      languageCode: message.languageCode,
      teamId: message.teamId,
      teamNumber: message.teamNumber,
      points: null,
      autoPoints: null,
      challenged: message.challenged
    };

    const activeItem = this.store.run.activeItem;

    if (
      activeItem &&
      activeItem.type === 'question' &&
      activeItem.phase === 'prompt' &&
      activeItem.id === message.questionId
    ) {
      const answer = activeItem.answers[message.teamId];

      if (answer) {
        answer.answerText = message.answerText;
      } else {
        activeItem.answers[message.teamId] = answerReceived;
      }
    }

    const promptItem = this.store.items.find(
      (item) => item.type === 'question' && item.phase === 'answer' && item.id === message.questionId
    );

    if (promptItem && promptItem.type === 'question' && promptItem.phase === 'answer') {
      const answer = promptItem.answers[message.teamId];

      if (answer) {
        answer.answerText = message.answerText;
      } else {
        promptItem.answers[message.teamId] = answerReceived;
      }
    }

    const answerItem = this.store.items.find(
      (item) => item.type === 'question' && item.phase === 'answer' && item.id === message.questionId
    );

    if (answerItem && answerItem.type === 'question' && answerItem.phase === 'answer') {
      const answer = answerItem.answers[message.teamId];

      if (answer) {
        answer.answerText = message.answerText;
      } else {
        answerItem.answers[message.teamId] = answerReceived;
      }
    }
  };

  private handleANSWER_CHALLENGE = (message: { questionId: string; teamId: string; challenged: boolean }) => {
    const activeItem = this.store.run.activeItem;

    if (
      activeItem &&
      activeItem.type === 'question' &&
      activeItem.phase === 'answer' &&
      activeItem.id === message.questionId
    ) {
      const answer = activeItem.answers[message.teamId];

      if (answer) {
        answer.challenged = message.challenged;
      }
    }

    const promptItem = this.store.items.find(
      (item) => item.type === 'question' && item.phase === 'prompt' && item.id === message.questionId
    );

    if (promptItem && promptItem.type === 'question' && promptItem.phase === 'prompt') {
      const answer = promptItem.answers[message.teamId];

      if (answer) {
        answer.challenged = message.challenged;
      }
    }

    const answerItem = this.store.items.find(
      (item) => item.type === 'question' && item.phase === 'answer' && item.id === message.questionId
    );

    if (answerItem && answerItem.type === 'question' && answerItem.phase === 'answer') {
      const answer = answerItem.answers[message.teamId];

      if (answer) {
        answer.challenged = message.challenged;
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
