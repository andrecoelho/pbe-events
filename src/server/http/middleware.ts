import { badRequest, forbidden, middleware, notFound, tooManyRequests, unauthorized } from '@/server/http/route';
import type { BaseCtx } from '@/server/http/route';
import { getEventRole, type EventWithRole, type Role } from '@/server/services/permissions';
import { getSessionUser, type SessionUser } from '@/server/session';
import type { Session } from '@/server/types';
import { z } from 'zod';

type AuthCtx = BaseCtx & { session?: Session; user?: SessionUser };

// Loads the session and user once per request, whichever middleware asks first.
async function requireUser(ctx: AuthCtx) {
  if (!ctx.user) {
    const found = await getSessionUser(ctx.req);

    if (!found) {
      throw unauthorized();
    }

    ctx.session = found.session;
    ctx.user = found.user;
  }

  return ctx.user;
}

// 401 unless the request has a live session. Adds `session` and `user`.
export const auth = () =>
  middleware<{ session: Session; user: SessionUser }>(async (ctx, next) => {
    await requireUser(ctx);
    return next();
  });

// 403 unless the user is a super admin. Signs the user in itself, so it can stand alone.
export const superAdmin = () =>
  middleware<{ session: Session; user: SessionUser }>(async (ctx, next) => {
    const user = await requireUser(ctx);

    if (!user.is_super_admin) {
      throw forbidden();
    }

    return next();
  });

interface EventRoleOptions {
  // Where the event id comes from. Defaults to the `:id` or `:eventId` path param.
  eventId?: (ctx: BaseCtx) => string | undefined | Promise<string | undefined>;
}

// 403 unless the user has one of `roles` on the event. Signs the user in itself.
// Adds `session`, `user` and `event` ({ id, name, title_remarks, role_id }).
export function eventRole(...args: [...Role[]] | [...Role[], EventRoleOptions]) {
  const last = args.at(-1);
  const options: EventRoleOptions = typeof last === 'object' ? last : {};
  const roles = args.filter((arg): arg is Role => typeof arg === 'string');

  return middleware<{ session: Session; user: SessionUser; event: EventWithRole }>(async (ctx, next) => {
    const user = await requireUser(ctx);
    const eventId = options.eventId ? await options.eventId(ctx) : (ctx.params.id ?? ctx.params.eventId);

    if (!eventId) {
      throw notFound('Event not found');
    }

    const event = await getEventRole(eventId, user.id);

    // Same answer whether the event is missing or not theirs, so ids can't be probed.
    if (!event || !roles.includes(event.role_id)) {
      throw forbidden();
    }

    (ctx as BaseCtx & { event?: EventWithRole }).event = event;

    return next();
  });
}

// Parses the JSON body with a Zod schema. 400 with the first problem in `error` and every
// problem by field in `fields`. Adds `body`, typed from the schema.
export const json = <S extends z.ZodType>(schema: S) =>
  middleware<{ body: z.output<S> }>(async (ctx, next) => {
    let raw: unknown;

    try {
      raw = await ctx.req.json();
    } catch {
      throw badRequest('The request body must be JSON.');
    }

    const result = schema.safeParse(raw);

    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';

      throw badRequest(`${where}${issue?.message ?? 'Invalid request'}`, {
        fields: z.flattenError(result.error).fieldErrors
      });
    }

    (ctx as BaseCtx & { body?: unknown }).body = result.data;

    return next();
  });

// The client's address. Railway's proxy sends it in X-Real-IP; locally it's the socket's address.
export function clientIp(ctx: BaseCtx) {
  return ctx.req.headers.get('x-real-ip') ?? ctx.server.requestIP(ctx.req)?.address ?? 'unknown';
}

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  // Who is being limited. Defaults to the client's IP address.
  key?: (ctx: BaseCtx) => string;
}

// In-memory fixed-window limiter (one process, so no shared store needed). 429 with Retry-After.
// Each call keeps its own counts, so create one per route.
export function rateLimit({ limit, windowMs, key = clientIp }: RateLimitOptions) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;

  return middleware<{}>(async (ctx, next) => {
    const now = Date.now();

    if (now >= nextSweep) {
      for (const [k, window] of windows) {
        if (window.resetAt <= now) windows.delete(k);
      }

      nextSweep = now + windowMs;
    }

    const k = key(ctx);
    let window = windows.get(k);

    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(k, window);
    }

    window.count++;

    if (window.count > limit) {
      const seconds = Math.ceil((window.resetAt - now) / 1000);
      throw tooManyRequests(`Too many attempts. Try again in ${seconds} seconds.`, seconds);
    }

    return next();
  });
}
