// route(): runs a stack of middlewares, then the handler, with shared error handling.
//
//   '/api/events/:id': {
//     PATCH: route(eventRole('owner', 'admin'), json(RenameEvent), async ({ event, body }) => {
//       await renameEvent(event.id, body.name);
//       return { id: event.id, name: body.name };
//     })
//   }
//
// Middlewares add fields to the context (`user`, `event`, `body`, ...) and the handler's context is
// typed from them. Throw an HttpError (`throw notFound('No such team')`) to answer with an error;
// anything else thrown is logged and answered with a 500 carrying a request id.
import { apiData } from '@/server/utils/responses';
import type { BunRequest, Server } from 'bun';

export interface BaseCtx {
  req: BunRequest<string>;
  server: Server<unknown>;
  params: Record<string, string>;
  requestId: string;
}

type Next = () => Promise<Response>;

// `Adds` is what the middleware puts on the context. It only exists in the type.
export type Middleware<Adds extends object = {}> = ((ctx: BaseCtx, next: Next) => Promise<Response>) & {
  readonly adds?: Adds;
};

// A handler returns a Response, or an object to send as JSON (camelCased by apiData).
type Handler<Ctx> = (ctx: Ctx) => Response | object | void | Promise<Response | object | void>;

type AddsOf<M> = M extends readonly [infer First, ...infer Rest]
  ? (First extends Middleware<infer A> ? A : {}) & AddsOf<Rest>
  : {};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const badRequest = (message = 'Bad Request', details?: Record<string, unknown>) =>
  new HttpError(400, message, details);
export const unauthorized = (message = 'Please sign in again.') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, message);
export const notFound = (message = 'Not Found') => new HttpError(404, message);
export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new HttpError(429, message, { retryAfterSeconds });

export function middleware<Adds extends object>(fn: (ctx: BaseCtx, next: Next) => Promise<Response>) {
  return fn as Middleware<Adds>;
}

function errorResponse(error: unknown, ctx: BaseCtx) {
  if (error instanceof HttpError) {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };

    if (error.status === 429 && typeof error.details?.retryAfterSeconds === 'number') {
      headers['Retry-After'] = String(error.details.retryAfterSeconds);
    }

    return new Response(JSON.stringify({ error: error.message, ...error.details }), {
      status: error.status,
      headers
    });
  }

  const url = new URL(ctx.req.url);
  console.error(`[${ctx.requestId}] ${ctx.req.method} ${url.pathname} failed:`, error);

  return new Response(
    JSON.stringify({ error: 'Something went wrong on our side. Please try again.', requestId: ctx.requestId }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}

export function route<const M extends readonly Middleware<any>[]>(...stack: [...M, Handler<BaseCtx & AddsOf<M>>]) {
  const middlewares = stack.slice(0, -1) as Middleware[];
  const handler = stack.at(-1) as Handler<BaseCtx>;

  return async (req: BunRequest<string>, server: Server<unknown>): Promise<Response> => {
    const ctx: BaseCtx = { req, server, params: req.params ?? {}, requestId: Bun.randomUUIDv7() };

    const run = async (index: number): Promise<Response> => {
      const current = middlewares[index];

      if (current) {
        return current(ctx, () => run(index + 1));
      }

      const result = await handler(ctx);

      return result instanceof Response ? result : apiData(result ?? undefined);
    };

    try {
      return await run(0);
    } catch (error) {
      return errorResponse(error, ctx);
    }
  };
}
