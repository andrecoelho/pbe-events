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
  first_name: string;
  last_name: string;
  created_at: string;
}

export interface Event {
  id: string;
  name: string;
  created_at: string;
}

export interface UserEvent {
  user_id: string;
  event_id: string;
  role_id: 'owner' | 'admin' | 'judge';
  created_at: string;
}
