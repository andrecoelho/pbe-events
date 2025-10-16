export function apiNotFound() {
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 404
  });
}

export function textNotFound() {
  return new Response('Not Found', { status: 404 });
}
