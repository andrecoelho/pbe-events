import {
  NOT_CONNECTED,
  WebSocketManager,
  type MessageResult,
  type WebSocketStatus
} from '@/frontend/components/WebSocketManager';
import type { ActiveItem, JudgeClientMessage, ServerMessage } from '@/types';
import { proxy } from 'valtio';

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
    string, // teamId
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

interface GradeStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  connectionState: WebSocketStatus;
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  activeItem: ActiveItem | null;
  questions: Question[];
  selectedQuestion?: Question;
}

const NO_ANSWER: MessageResult = { ok: false, error: 'That team has no answer to grade.' };

export class GradeValt {
  private ws: WebSocketManager<JudgeClientMessage> | null = null;
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

    const data = (await response.json()) as {
      eventName?: string;
      questions: Question[];
    };

    if (data.eventName) {
      this.store.eventName = data.eventName;
    }

    if (data.questions) {
      this.store.questions = data.questions;
      this.store.selectedQuestion = data.questions.length > 0 ? data.questions[0] : undefined;
    }

    this.store.initialized = true;

    if (this.store.questions.length > 0) {
      this.connect();
    }
  };

  connect = () => {
    if (this.ws) {
      this.ws.connect();
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/event-run/ws', `${protocol}//${window.location.host}`);

      wsUrl.search = new URLSearchParams({ role: 'judge', eventId: this.store.eventId }).toString();
      this.ws = new WebSocketManager<JudgeClientMessage>(wsUrl.toString(), this.onStatusChange, this.onMessage);
      this.ws.connect();
    }
  };

  cleanup = () => {
    this.ws?.destroy();
  };

  onStatusChange = (status: WebSocketStatus) => {
    this.store.connectionState = status;
    this.store.activeItem = null;
  };

  onMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'RUN_STATUS':
        this.store.runStatus = message.status;
        break;
      case 'ACTIVE_ITEM':
        this.handleSET_ACTIVE_ITEM(message.activeItem);
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

  selectQuestion = (questionId: string) => {
    this.store.selectedQuestion = this.store.questions.find((q) => q.id === questionId);
  };

  selectNextQuestion = () => {
    const currentIndex = this.store.questions.findIndex((q) => q.id === this.store.selectedQuestion?.id);

    if (currentIndex >= 0 && currentIndex < this.store.questions.length - 1) {
      this.store.selectedQuestion = this.store.questions[currentIndex + 1];
    }
  };

  selectPreviousQuestion = () => {
    const currentIndex = this.store.questions.findIndex((q) => q.id === this.store.selectedQuestion?.id);

    if (currentIndex > 0) {
      this.store.selectedQuestion = this.store.questions[currentIndex - 1];
    }
  };

  updatePoints = async (questionId: string, teamId: string, points: number | null): Promise<MessageResult> => {
    const question = this.store.questions.find((q) => q.id === questionId);
    const answer = question?.answers[teamId];

    if (!answer?.answerId) {
      return NO_ANSWER;
    }

    if (points !== null && (Number.isNaN(points) || points < 0 || points > question!.maxPoints)) {
      return { ok: false, error: `Points must be a whole number from 0 to ${question!.maxPoints}.` };
    }

    answer.points = points;

    return await this.notifyPointsUpdated(questionId, answer.answerId, points);
  };

  giveMaxPoints = async (questionId: string, teamId: string): Promise<MessageResult> => {
    const question = this.store.questions.find((q) => q.id === questionId);
    const answer = question?.answers[teamId];

    if (answer && answer.answerId) {
      answer.points = question.maxPoints;

      return await this.notifyPointsUpdated(question.id, answer.answerId, question.maxPoints);
    }

    return NO_ANSWER;
  };

  giveZeroPoints = async (questionId: string, teamId: string): Promise<MessageResult> => {
    const question = this.store.questions.find((q) => q.id === questionId);
    const answer = question?.answers[teamId];

    if (answer && answer.answerId) {
      answer.points = 0;

      return await this.notifyPointsUpdated(question.id, answer.answerId, 0);
    }

    return NO_ANSWER;
  };

  notifyPointsUpdated = async (questionId: string, answerId: string, points: number | null) => {
    return (await this.ws?.sendMessage({ type: 'UPDATE_POINTS', questionId, answerId, points })) ?? NOT_CONNECTED;
  };

  setQuestionGraded = async (questionId: string, graded: boolean): Promise<MessageResult> => {
    return (await this.ws?.sendMessage({ type: 'SET_QUESTION_GRADED', questionId, graded })) ?? NOT_CONNECTED;
  };

  private handleSET_ACTIVE_ITEM = (activeItem: ActiveItem | null) => {
    this.store.activeItem = activeItem;

    if (activeItem) {
      if (activeItem.type === 'question' && activeItem.phase !== 'reading') {
        for (const item of this.store.questions) {
          if (item.id === activeItem.id) {
            item.locked = activeItem.locked;
            item.graded = activeItem.graded;
            item.answers = activeItem.answers;
          }
        }
      }
    }
  };

  private handlePOINTS_UPDATED = (questionId: string, answerId: string, points: number | null) => {
    for (const question of this.store.questions) {
      if (question.id !== questionId) {
        continue;
      }

      for (const teamId in question.answers) {
        if (!Object.hasOwn(question.answers, teamId)) {
          continue;
        }

        const answer = question.answers[teamId];

        if (answer?.answerId === answerId) {
          answer.points = points;
          return;
        }
      }

      break;
    }
  };

  private handleQUESTION_GRADED = (questionId: string, graded: boolean) => {
    for (const question of this.store.questions) {
      if (question.id !== questionId) {
        continue;
      }

      question.graded = graded;
      break;
    }
  };

  private handleQUESTION_LOCKED = (questionId: string, locked: boolean) => {
    for (const question of this.store.questions) {
      if (question.id !== questionId) {
        continue;
      }

      question.locked = locked;
      break;
    }
  };
}
