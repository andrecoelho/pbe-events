import { keysToCamel } from './caseConversion';

export function apiData(data?: object, headers?: HeadersInit) {
  // Convert all keys from snake_case to camelCase for API responses
  const camelData = data ? keysToCamel(data) : {};

  return new Response(JSON.stringify({ ...camelData }), {
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

export function apiBadRequest(message: string = 'Bad Request') {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status: 400
  });
}

export function apiUnauthorized(message: string = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status: 401
  });
}

export function apiForbidden() {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 403
  });
}

export function apiNotFound(message: string = 'Not Found') {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status: 404
  });
}

export function apiServerError(message: string = 'Internal Server Error') {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status: 500
  });
}

export function textBadRequest(message: string = 'Bad Request') {
  return new Response(message, { status: 400 });
}

export function textUnauthorized(message: string = 'Unauthorized') {
  return new Response(message, { status: 401 });
}

export function textForbidden(message: string = 'Forbidden') {
  return new Response(message, { status: 403 });
}

export function textNotFound(message: string = 'Not Found') {
  return new Response(message, { status: 404 });
}

export function textServerError(message: string = 'Internal Server Error') {
  return new Response(message, { status: 500 });
}
