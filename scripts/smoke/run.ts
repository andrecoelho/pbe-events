// Smoke test of the API and a live run over the WebSocket, against a local server with the seeded demo
// event (`bun run db:seed`). Prints a normalized transcript (ids and times masked) so two versions of the
// server can be diffed; scripts/smoke/compare.sh does that. Usage: bun scripts/smoke/run.ts [base URL]
const base = process.argv[2] ?? 'http://localhost:3456';
const out: string[] = [];
const log = (label: string, value: unknown) => out.push(`${label}: ${JSON.stringify(normalize(value))}`);

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [
          k,
          /^(id|answerId|requestId|startTime|createdAt|created_at|__ACK__)$/.test(k) && typeof v !== 'object'
            ? '<x>'
            : k === 'answers' && v && typeof v === 'object' && !Array.isArray(v)
              ? Object.fromEntries(
                  Object.entries(v)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([t, a]) => [t, normalize(a)])
                )
              : normalize(v)
        ])
    );
  }
  return value;
}

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@example.com', password: 'demo-password' })
});
const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
log('login', login.status);

async function api(method: string, path: string, body?: unknown, withCookie = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(withCookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  log(`${method} ${path}`, { status: res.status, data });
  return data as any;
}

const ev = 'seed-event-demo';
await api('GET', '/api/session');
await api('GET', '/api/events');
await api('GET', '/api/events', undefined, false);
const created = await api('POST', '/api/events', { name: '  Smoke Event ' });
await api('POST', '/api/events', { name: ' ' });
await api('PATCH', `/api/events/${created.id}`, { name: 'Smoke Renamed' });
await api('PATCH', `/api/events/nope`, { name: 'x' });
const dup = await api('POST', `/api/events/${ev}/duplicate`, { name: 'Smoke Copy' });
await api('GET', `/api/events/${dup.id}/teams`);
await api('GET', `/api/events/${dup.id}/run`);
await api('DELETE', `/api/events/${dup.id}`);
await api('DELETE', `/api/events/${created.id}`);
await api('GET', '/api/events');
await api('GET', `/api/events/${ev}/teams`);
await api('GET', `/api/events/${ev}/languages`);
await api('GET', `/api/events/${ev}/permissions`);

// WebSocket run-through
const wsBase = base.replace('http', 'ws') + '/event-run/ws';
function open(query: string, withCookie: boolean) {
  const ws = new WebSocket(`${wsBase}?${query}`, withCookie ? ({ headers: { Cookie: cookie } } as any) : undefined);
  const messages: any[] = [];
  ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
  return new Promise<{ ws: WebSocket; messages: any[] }>((resolve) => (ws.onopen = () => resolve({ ws, messages })));
}
const sleep = (ms: number) => Bun.sleep(ms);
const dump = (label: string, messages: any[]) => {
  log(
    label,
    messages.filter((m) => m.type !== 'ACK')
  );
  messages.length = 0;
};

const host = await open(`role=host&eventId=${ev}`, true);
const judge = await open(`role=judge&eventId=${ev}`, true);
const team = await open(`role=team&eventId=${ev}&teamId=seed-team-1&hash=h1`, false);
const bad = await open(`role=host&eventId=${ev}`, false);
const badTeam = await open(`role=team&eventId=${ev}&teamId=nope&hash=h`, false);
await sleep(300);
dump('host open', host.messages);
dump('judge open', judge.messages);
dump('team open', team.messages);
dump('unauthorized host', bad.messages);
dump('unknown team', badTeam.messages);

const run = await api('GET', `/api/events/${ev}/run`);
const q = run.questions[0];
const send = (c: { ws: WebSocket }, m: object) => c.ws.send(JSON.stringify({ ...m, __ACK__: 'a' }));

send(host, { type: 'UPDATE_RUN_STATUS', status: 'in_progress' });
send(host, { type: 'UPDATE_GRACE_PERIOD', gracePeriod: 3 });
const prompt = {
  type: 'question',
  id: q.id,
  number: q.number,
  questionType: q.type,
  maxPoints: q.maxPoints,
  phase: 'prompt',
  seconds: q.seconds,
  locked: false,
  graded: false,
  startTime: null,
  remainingSeconds: q.seconds,
  isTimeUp: false,
  translations: q.translations.map((t: any) => ({ languageCode: t.languageCode, prompt: t.prompt })),
  answers: q.answers
};
send(host, { type: 'SET_ACTIVE_ITEM', activeItem: prompt });
await sleep(300);
send(team, { type: 'SUBMIT_ANSWER', answer: 'Smoke answer' });
await sleep(300);
// The answer phase as the run page builds it (src/frontend/app/pages/runs/runValt.ts).
const answerPhase = {
  type: 'question',
  id: q.id,
  number: q.number,
  phase: 'answer',
  locked: false,
  graded: false,
  translations: q.translations.map((t: any) => ({
    languageCode: t.languageCode,
    answer: t.answer,
    clarification: t.clarification
  })),
  answers: q.answers
};
send(host, { type: 'SET_ACTIVE_ITEM', activeItem: answerPhase });
await sleep(200);
send(team, { type: 'SUBMIT_CHALLENGE', questionId: q.id, challenged: true });
await sleep(200);
send(host, { type: 'SET_QUESTION_LOCKED', questionId: q.id, locked: true });
await sleep(200);
const answers = await api('GET', `/api/events/${ev}/answers`);
const answerId = answers.questions[0].answers['seed-team-1'].answerId;
send(judge, { type: 'UPDATE_POINTS', answerId, points: 2 });
await sleep(200);
send(judge, { type: 'SET_QUESTION_GRADED', questionId: q.id, graded: true });
await sleep(300);
dump(
  'host run',
  host.messages.map((m) =>
    m.type === 'ACTIVE_ITEM' ? { ...m, activeItem: { ...m.activeItem, remainingSeconds: '<t>' } } : m
  )
);
dump(
  'judge run',
  judge.messages.map((m) =>
    m.type === 'ACTIVE_ITEM' ? { ...m, activeItem: { ...m.activeItem, remainingSeconds: '<t>' } } : m
  )
);
dump(
  'team run',
  team.messages.map((m) =>
    m.type === 'ACTIVE_ITEM' ? { ...m, activeItem: { ...m.activeItem, remainingSeconds: '<t>' } } : m
  )
);
await api('GET', `/api/events/${ev}/results`);
await api('GET', `/api/events/${ev}/results/raw`);

// Reset back to the start: erases answers and unlocks questions.
send(host, { type: 'UPDATE_RUN_STATUS', status: 'not_started' });
send(host, { type: 'SET_ACTIVE_ITEM', activeItem: null });
await sleep(300);
const after = await api('GET', `/api/events/${ev}/answers`);
log('after reset first answer', after.questions[0].answers['seed-team-1']);

for (const c of [host, judge, team, bad, badTeam]) c.ws.close();
await sleep(200);
console.log(out.join('\n').replace(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>'));
process.exit(0);
