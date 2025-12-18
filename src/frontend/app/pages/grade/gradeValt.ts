import { WebSocketManager, type WebSocketStatus } from '@/frontend/components/WebSocketManager';
import type { ActiveItem } from '@/types';
import { proxy } from 'valtio';

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
      languageCode: string | null;
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
  connectionState: WebSocketStatus;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  activeItem: ActiveItem | null;
  questions: Question[];
  selectedQuestionId?: string;
}

type WebSocketGradeMessage =
  | { type: 'RUN_STATUS'; status: 'not_started' | 'in_progress' | 'paused' | 'completed' }
  | { type: 'ACTIVE_ITEM'; activeItem: ActiveItem }
  | {
      type: 'ANSWER_RECEIVED';
      teamId: string;
      teamNumber: number;
      questionId: string;
      translationId: string;
      languageCode: string;
      answerId: string;
      answerText: string;
    }
  | { type: 'POINTS_UPDATED'; answerId: string; questionId: string; teamId: string; points: number | null };

export class GradeValt {
  private ws: WebSocketManager<WebSocketGradeMessage> | null = null;
  public store: GradeStore;

  constructor() {
    this.store = proxy({
      initialized: false,
      eventId: '',
      eventName: '',
      connectionState: 'init',
      runStatus: 'not_started',
      activeItem: null,
      languages: {},
      questions: []
    });
  }

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

    this.connect();
  };

  connect = () => {
    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      wsUrl.search = new URLSearchParams({ role: 'judge', eventId: this.store.eventId }).toString();
      this.ws = new WebSocketManager(wsUrl.toString(), this.onStatusChange, this.onMessage);
      this.ws.connect();
    }
  };

  cleanup = () => {
    this.ws?.destroy();
  };

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;
  };

  onMessage = (message: WebSocketGradeMessage) => {
    switch (message.type) {
      case 'RUN_STATUS':
        this.store.runStatus = message.status;
        break;
      case 'ACTIVE_ITEM':
        this.store.activeItem = message.activeItem;
        break;
      case 'ANSWER_RECEIVED': {
        const question = this.store.questions.find((q) => q.id === message.questionId);

        if (question) {
          const answer = question.answers[message.answerId];

          if (answer) {
            answer.answerText = message.answerText;
          } else {
            question.answers[message.teamId] = {
              answerId: message.answerId,
              answerText: message.answerText,
              languageCode: message.languageCode,
              teamId: message.teamId,
              teamNumber: message.teamNumber,
              points: null,
              autoPoints: null
            };
          }
        }

        break;
      }
      case 'POINTS_UPDATED': {
        const question = this.store.questions.find((q) => q.id === message.questionId);

        if (question) {
          const answer = question.answers[message.teamId];

          if (answer && answer.answerId === message.answerId && answer.points !== message.points) {
            answer.points = message.points;
          }
        }

        break;
      }
    }
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
    const answer = question?.answers[teamId];

    if (answer && answer.answerId && (points === null || (points >= 0 && points <= question.maxPoints))) {
      answer.points = points;

      this.notifyPointsUpdated(questionId, answer.answerId, points);
    }
  };

  giveMaxPoints = (questionId: string, teamId: string) => {
    const question = this.store.questions.find((q) => q.id === questionId);
    const answer = question?.answers[teamId];

    if (answer && answer.answerId) {
      answer.points = question.maxPoints;

      this.notifyPointsUpdated(question.id, answer.answerId, question.maxPoints);
    }
  };

  giveZeroPoints = (questionId: string, teamId: string) => {
    const question = this.store.questions.find((q) => q.id === questionId);
    const answer = question?.answers[teamId];

    if (answer && answer.answerId) {
      answer.points = 0;

      this.notifyPointsUpdated(question.id, answer.answerId, 0);
    }
  };

  notifyPointsUpdated = (questionId: string, answerId: string, points: number | null) => {
    this.ws?.sendMessage({ type: 'UPDATE_POINTS', questionId, answerId, points });
  };
}
