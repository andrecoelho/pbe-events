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
