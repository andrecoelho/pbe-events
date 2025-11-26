import type { BunRequest } from 'bun';

export type Routes = Record<string, Record<string, (req: BunRequest) => Promise<Response> | Response>>;

export interface Session {
  id: string;
  user_id: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  avatar: Blob;
  createdAt: string;
}

export interface PBEEvent {
  id: string;
  name: string;
  createdAt: string;
}

export interface Permission {
  userId: string;
  eventId: string;
  roleId: 'owner' | 'admin' | 'judge';
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  number: number;
  eventId: string;
  languageId: string | null;
  createdAt: string;
}

export interface Question {
  id: string;
  number: number;
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  eventId: string;
  createdAt: string;
}

export interface QuestionInfo {
  id: string;
  body: string;
  answer: string;
  languageId: string;
  questionId: string;
  createdAt: string;
}

export interface Run {
  eventId: string;
  status: 'not_started' | 'in_progress' | 'paused' | 'completed';
  gracePeriod: number;
}

export interface ActiveItemCache {
  id: string;
  type: 'question' | 'slide'; // Type of the active item
  phase: 'slide' | 'prompt' | 'answer' | 'ended';
  seconds: number; // Only relevant for questions with timer
  startTime: string; // ISO string from database
  hasTimer: boolean; // Whether timer is enabled for this item
}

export interface Answer {
  id: string;
  answer: string;
  autoPointsAwarded: number | null;
  pointsAwarded: number | null;
  questionId: string;
  teamId: string;
  translationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Translation {
  id: string;
  prompt: string;
  answer: string;
  clarification: string | null;
  languageId: string;
  questionId: string;
  createdAt: string;
}

export interface Language {
  id: string;
  code: string;
  name: string;
  eventId: string;
  createdAt: string;
}

export interface Slide {
  id: string;
  eventId: string;
  number: number;
  content: string;
  createdAt: string;
}

// WebSocket Message Types
export type ErrorCode =
  | 'NO_ACTIVE_RUN'
  | 'HOST_ALREADY_CONNECTED'
  | 'INVALID_TEAM'
  | 'UNAUTHORIZED'
  | 'RUN_ALREADY_STARTED'
  | 'NO_LANGUAGE_SELECTED'
  | 'NO_ACTIVE_QUESTION'
  | 'DEADLINE_EXCEEDED'
  | 'TRANSLATION_NOT_FOUND'
  | 'SLIDE_NOT_FOUND'
  | 'INVALID_ROLE'
  | 'INVALID_PHASE';

export type HostMessage =
  | { type: 'START_RUN' }
  | { type: 'START_QUESTION'; questionId: string; hasTimer: boolean }
  | { type: 'PAUSE_RUN' }
  | { type: 'RESUME_RUN' }
  | { type: 'SHOW_ANSWER' }
  | { type: 'END_QUESTION' }
  | { type: 'COMPLETE_RUN' }
  | { type: 'SHOW_SLIDE'; slideId: string };

export type TeamMessage =
  | { type: 'SELECT_LANGUAGE'; languageId: string }
  | { type: 'SUBMIT_ANSWER'; answer: string }
  | { type: 'UPDATE_ANSWER'; answerId: string; answer: string };

export type ServerMessage =
  | { type: 'RUN_STARTED'; run: Run }
  | {
      type: 'QUESTION_STARTED';
      translation: {
        id: string;
        prompt: string;
        clarification: string | null;
        languageId: string;
        questionId: string;
      };
      startTime: number;
      seconds: number;
      hasTimer: boolean;
      gracePeriod: number;
    }
  | { type: 'QUESTION_ENDED' }
  | { type: 'RUN_PAUSED' }
  | { type: 'RUN_RESUMED' }
  | {
      type: 'ANSWER_SHOWN';
      translations: Array<{ languageCode: string; answer: string; clarification: string | null }>;
    }
  | { type: 'SLIDE_SHOWN'; slide: Slide }
  | {
      type: 'TEAM_CONNECTED';
      teamId: string;
      teamName: string;
      teamNumber: number;
      languageCode: string | null;
    }
  | { type: 'TEAM_DISCONNECTED'; teamId: string }
  | { type: 'ANSWER_RECEIVED'; teamId: string; hasAnswer: boolean }
  | { type: 'YOUR_ANSWER'; answerId: string; answer: string }
  | { type: 'GRACE_PERIOD_UPDATED'; gracePeriod: number }
  | { type: 'RUN_COMPLETED'; scores: Array<{ teamId: string; teamName: string; teamNumber: number; total: number }> }
  | { type: 'ERROR'; code: ErrorCode; message: string };
