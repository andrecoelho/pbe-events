import type { BunRequest } from 'bun';

// `any` lets each handler type its own path params, e.g. `BunRequest<'/api/events/:id'>`
// (@types/bun 1.4 no longer accepts those as `BunRequest<string>`).
export type Routes = Record<string, Record<string, (req: BunRequest<any>) => Promise<Response> | Response>>;

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
