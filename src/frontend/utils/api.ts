import { toast } from '@/frontend/components/Toast';
// Calls the API and turns every outcome into { ok: true, data } or { ok: false, error }, where `error` is a
// sentence to show the person (#51): the server's own message, or what went wrong and what to do about it when
// the server couldn't say (no connection, a deploy in progress, an expired session).

// On failure, `body` is the server's parsed answer (e.g. an import conflict's details), when there is one.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number; body?: unknown };

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  // Sent as JSON.
  json?: unknown;
  // Sent as is (e.g. FormData for uploads).
  body?: BodyInit;
};

// What a valt's action resolves with: done, or why not (a sentence to show).
export type Outcome = { ok: true } | { ok: false; error: string };

// Shows a failed action's reason as an error toast (for actions whose caller has nothing else to do).
export function reportFailure(result: Outcome) {
  if (!result.ok) {
    toast.show({ type: 'error', message: result.error });
  }
}

export const NO_CONNECTION = 'Couldn’t reach the server. Check your internet connection and try again.';

export async function api<T = unknown>(path: string, options: Options = {}): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.json === undefined ? options.body : JSON.stringify(options.json)
    });
  } catch {
    return { ok: false, error: NO_CONNECTION };
  }

  // A response that isn't JSON (e.g. a proxy's error page while the server restarts) has no message to show.
  const body = (await response.json().catch(() => null)) as (T & { error?: unknown; requestId?: string }) | null;

  if (response.ok) {
    return body === null
      ? { ok: false, error: unexpected(response.status), status: response.status }
      : { ok: true, data: body };
  }

  // The session ended (signed out elsewhere, or 30 days unused): reloading shows the login page.
  if (response.status === 401 && !path.startsWith('/api/login')) {
    window.location.reload();
  }

  const message = typeof body?.error === 'string' ? body.error : unexpected(response.status);
  const reference = body?.requestId ? ` (Reference: ${body.requestId.slice(-8)})` : '';

  return { ok: false, error: message + reference, status: response.status, body };
}

function unexpected(status: number) {
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is restarting or busy. Wait a moment and try again.';
  }

  if (status === 413) {
    return 'That file is too large.';
  }

  return `Something went wrong (error ${status}). Try again, and if it keeps happening, reload the page.`;
}
