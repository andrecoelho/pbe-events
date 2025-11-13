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

export function badRequest(message: string = 'Bad Request') {
  return new Response(message, { status: 400 });
}

export function textNotFound() {
  return new Response('Not Found', { status: 404 });
}
