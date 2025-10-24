import type { BunRequest } from 'bun';

export type Routes = Record<string, Record<string, (req: BunRequest) => Promise<Response> | Response>>;

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
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
  languageCode: string;
  questionId: string;
  createdAt: string;
}
