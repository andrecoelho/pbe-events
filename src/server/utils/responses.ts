import { keysToCamel } from './caseConversion';

export function apiData(data?: object, headers?: HeadersInit) {
  // Convert all keys from snake_case to camelCase for API responses
  const camelData = data ? keysToCamel(data) : {};

  return new Response(JSON.stringify({ ...camelData }), {
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

export function apiNotFound(message: string = 'Not Found') {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status: 404
  });
}

export function textNotFound(message: string = 'Not Found') {
  return new Response(message, { status: 404 });
}

export function textServerError(message: string = 'Internal Server Error') {
  return new Response(message, { status: 500 });
}
