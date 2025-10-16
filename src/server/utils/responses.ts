export function apiData(data?: object, headers?: HeadersInit) {
  return new Response(JSON.stringify({ ...data, ok: true }), {
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

export function textNotFound() {
  return new Response('Not Found', { status: 404 });
}
