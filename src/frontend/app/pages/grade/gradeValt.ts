import type { ActiveItem } from '@/types';
import { proxy } from 'valtio';

const MAX_RECONNECT_ATTEMPTS = 5;

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
    string, // teamId
    {
      answerId: string | null;
      answerText: string | null;
      teamId: string;
      teamNumber: number;
      points: number | null;
      autoPoints: number | null;
    }
  >;
}

interface GradeStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'closed' | 'error';
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  activeItem: ActiveItem | null;
  questions: Question[];
  selectedQuestionId?: string;
}

export class GradeValt {
  private ws: WebSocket | null = null;
  public store: GradeStore;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.store = proxy({
      initialized: false,
      eventId: '',
      eventName: '',
      connectionState: 'disconnected',
      runStatus: 'not_started',
      activeItem: null,
      languages: {},
      questions: []
    });
  }

  cleanup = () => {
    this.disconnectWebSocket();

    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
    }
  };

  init = async (eventId: string) => {
    this.store.eventId = eventId;

    // Fetch questions and answers from the API
    const response = await fetch(`/api/events/${eventId}/answers`);
    const data = await response.json();

    if (data.eventName) {
      this.store.eventName = data.eventName;
    }

    if (data.questions) {
      this.store.questions = data.questions;
      this.store.selectedQuestionId = data.questions.length > 0 ? data.questions[0].id : undefined;
    }

    this.store.initialized = true;

    this.connectWebSocket();
  };

  disconnectWebSocket = () => {
    this.ws?.close();
    this.ws = null;
    this.store.connectionState = 'disconnected';
  };

  connectWebSocket = () => {
    const { promise, resolve, reject } = Promise.withResolvers<{ ok: true } | { ok: false; error: string }>();

    if (this.ws?.readyState === WebSocket.OPEN) {
      resolve({ ok: true } as const);
      return promise;
    }

    this.store.connectionState = 'connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

    wsUrl.search = new URLSearchParams({ role: 'judge', eventId: this.store.eventId }).toString();

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
          | { type: 'RUN_STATUS'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' }
          | { type: 'ACTIVE_ITEM'; activeItem: ActiveItem }
          | {
              type: 'ANSWER_RECEIVED';
              teamId: string;
              teamNumber: number;
              questionId: string;
              translationId: string;
              answerId: string;
              answerText: string;
            };

        switch (message.type) {
          case 'RUN_STATUS':
            this.store.runStatus = message.status;
            break;
          case 'ACTIVE_ITEM':
            this.store.activeItem = message.activeItem;
            break;
          case 'ANSWER_RECEIVED':
            const question = this.store.questions.find((q) => q.id === message.questionId);

            if (question) {
              const answer = question.answers[message.answerId];

              if (answer) {
                answer.answerText = message.answerText;
              } else {
                question.answers[message.teamId] = {
                  answerId: message.answerId,
                  answerText: message.answerText,
                  teamId: message.teamId,
                  teamNumber: message.teamNumber,
                  points: null,
                  autoPoints: null
                };
              }
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

  selectQuestion = (questionId: string) => {
    this.store.selectedQuestionId = questionId;
  };

  selectNextQuestion = () => {
    const currentIndex = this.store.questions.findIndex((q) => q.id === this.store.selectedQuestionId);

    if (currentIndex >= 0 && currentIndex < this.store.questions.length - 1) {
      this.store.selectedQuestionId = this.store.questions[currentIndex + 1]!.id;
    }
  };

  selectPreviousQuestion = () => {
    const currentIndex = this.store.questions.findIndex((q) => q.id === this.store.selectedQuestionId);

    if (currentIndex > 0) {
      this.store.selectedQuestionId = this.store.questions[currentIndex - 1]!.id;
    }
  };

  updatePoints = (questionId: string, teamId: string, points: number | null) => {
    const question = this.store.questions.find((q) => q.id === questionId);

    if (question && question.answers[teamId] && (points === null || (points >= 0 && points <= question.maxPoints))) {
      question.answers[teamId]!.points = points;
    }
  };

  giveMaxPoints = (questionId: string, teamId: string) => {
    const question = this.store.questions.find((q) => q.id === questionId);

    if (question && question.answers[teamId]) {
      question.answers[teamId]!.points = question.maxPoints;
    }
  };

  giveZeroPoints = (questionId: string, teamId: string) => {
    const question = this.store.questions.find((q) => q.id === questionId);

    if (question && question.answers[teamId]) {
      question.answers[teamId]!.points = 0;
    }
  };
}
