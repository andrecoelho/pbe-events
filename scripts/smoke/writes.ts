// Smoke test of the write paths (languages, teams, slides, questions and import/export, permissions,
// users and auth), including the permission cases that used to leak across events. Creates its own events
// and a second user, and removes them at the end. Prints a normalized transcript for diffing two versions
// of the server; scripts/smoke/compare.sh does that.
// Usage: bun scripts/smoke/writes.ts [base URL] [questions YAML file]
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3456';
const yamlPath = process.argv[3] ?? join(import.meta.dir, '../../docs/questions-example.yaml');
const out: string[] = [];

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, /^(createdAt|created_at|requestId)$/.test(k) ? '<x>' : normalize(v)])
    );
  }
  return value;
}

async function login(email: string, password: string) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  out.push(`login ${email}: ${res.status}`);
  return res.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function call(cookie: string, method: string, path: string, body?: unknown, label = '') {
  const isForm = body instanceof FormData;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Cookie: cookie, ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  const shown = typeof data === 'string' && data.length > 300 ? `${data.slice(0, 300)}…` : data;
  out.push(`${label || method + ' ' + path}: ${JSON.stringify(normalize({ status: res.status, data: shown }))}`);
  return data as any;
}

// A second user, removed first in case an earlier run stopped halfway.
const email2 = 'smoke-judge@example.com';
// The password depends on how far that run got.
for (const password of ['smoke-password', 'smoke-password-2']) {
  const leftover = await login(email2, password);
  if (leftover) await call(leftover, 'DELETE', '/api/users/me', undefined, 'cleanup');
}
out.length = 0;

process.on('uncaughtException', (error) => {
  out.push(`CRASH: ${error}`);
  console.log(out.join('\n'));
  process.exit(1);
});

const demo = await login('demo@example.com', 'demo-password');
const E = (await call(demo, 'POST', '/api/events', { name: 'Smoke Writes' })).id;
const ev = `/api/events/${E}`;

// Languages
const en = (await call(demo, 'POST', `${ev}/languages`, { code: 'en', name: 'English' })).id;
await call(demo, 'POST', `${ev}/languages`, { code: 'en', name: 'Again' });
await call(demo, 'POST', `${ev}/languages`, { code: ' ', name: 'Blank' });
await call(demo, 'POST', `${ev}/languages`, { code: 'xx', name: ' ' });
const fr = (await call(demo, 'POST', `${ev}/languages`, { code: 'fr', name: 'French' })).id;
await call(demo, 'PATCH', `${ev}/languages`, { id: fr, code: 'fr', name: 'Français' });
await call(demo, 'PATCH', `${ev}/languages`, { id: fr, code: 'en', name: 'Clash' });
await call(demo, 'GET', `${ev}/languages`);

// Teams
const tA = (await call(demo, 'POST', `${ev}/teams`, { name: ' Alpha ', languageId: en })).id;
await call(demo, 'POST', `${ev}/teams`, { name: 'Alpha', languageId: en });
await call(demo, 'POST', `${ev}/teams`, { name: 'NoLang' });
await call(demo, 'POST', `${ev}/teams`, { name: 'BadLang', languageId: 'nope' });
await call(demo, 'POST', `${ev}/teams`, { name: ' ', languageId: en });
const tB = (await call(demo, 'POST', `${ev}/teams`, { name: 'Beta', languageId: fr })).id;
const tC = (await call(demo, 'POST', `${ev}/teams`, { name: 'Gamma', languageId: en })).id;
await call(demo, 'PATCH', `${ev}/teams`, { id: tB, name: 'Beta 2', number: 2, languageId: en });
await call(demo, 'PATCH', `${ev}/teams`, { id: tB, name: 'Alpha', number: 2, languageId: en });
await call(demo, 'DELETE', `${ev}/teams`, { id: tA });
await call(demo, 'DELETE', `${ev}/teams`, { id: 'nope' });
await call(demo, 'GET', `${ev}/teams`);
void tC;

// Slides and title remarks
const s1 = (await call(demo, 'POST', `${ev}/slides`, { content: 'one' })).slideId;
await call(demo, 'POST', `${ev}/slides`, { content: 'two' });
await call(demo, 'POST', `${ev}/slides`, { content: 3 });
await call(demo, 'PATCH', `/api/slides/${s1}`, { content: 'uno' });
await call(demo, 'PATCH', `/api/slides/${s1}`, { content: '' });
await call(demo, 'PATCH', `/api/slides/nope`, { content: 'x' });
await call(demo, 'PATCH', `${ev}/title-remarks`, { titleRemarks: 'Welcome' });
await call(demo, 'PATCH', `${ev}/title-remarks`, { titleRemarks: 5 });
await call(demo, 'GET', `${ev}/slides`);
await call(demo, 'DELETE', `/api/slides/${s1}`);
await call(demo, 'DELETE', `/api/slides/nope`);
await call(demo, 'GET', `${ev}/slides`);

// Questions
const q1 = (await call(demo, 'POST', `${ev}/questions`, { type: 'PS', maxPoints: 2, seconds: 30 })).question.id;
const q2 = (await call(demo, 'POST', `${ev}/questions`, { type: 'TF', maxPoints: 1, seconds: 20 })).question.id;
await call(demo, 'POST', `${ev}/questions`, { type: 'PG', maxPoints: 3, seconds: 40, insertBefore: 1 });
await call(demo, 'POST', `${ev}/questions`, { type: 'XX', maxPoints: 1, seconds: 1 });
await call(demo, 'POST', `${ev}/questions`, { type: 'PG', maxPoints: 0, seconds: 1 });
await call(demo, 'POST', `${ev}/questions`, { type: 'PG', maxPoints: 1, seconds: 1, insertBefore: 0 });
await call(demo, 'POST', `${ev}/questions`, { type: 'PG' });
const tr1 = (
  await call(demo, 'POST', `/api/questions/${q1}/translations`, {
    languageCode: 'en',
    prompt: ' Who? ',
    answer: ' Daniel '
  })
).translation.id;
await call(demo, 'POST', `/api/questions/${q1}/translations`, { languageCode: 'de', prompt: 'x', answer: 'y' });
const trNull = (
  await call(
    demo,
    'POST',
    `/api/questions/${q1}/translations`,
    { languageCode: 'fr', prompt: 'Qui?', answer: 'Daniel', clarification: null },
    'POST translation, null clarification (as the page sends)'
  )
).translation?.id;
await call(
  demo,
  'PATCH',
  `/api/questions/translations/${trNull}`,
  { languageCode: 'fr', clarification: 'Le prophète' },
  'PATCH translation with languageCode (as the page sends)'
);
await call(
  demo,
  'PATCH',
  `/api/questions/translations/${trNull}`,
  { languageCode: 'fr', clarification: null },
  'PATCH translation, null clarification'
);
await call(demo, 'POST', `/api/questions/${q1}/translations`, { languageCode: 'en', prompt: 'x' });
await call(demo, 'POST', `/api/questions/${q2}/translations`, { languageCode: 'en', prompt: 'True?', answer: 'maybe' });
await call(demo, 'POST', `/api/questions/${q2}/translations`, {
  languageCode: 'fr',
  prompt: 'Vrai?',
  answer: 'true',
  clarification: ' c '
});
await call(demo, 'POST', `/api/questions/nope/translations`, { languageCode: 'en', prompt: 'x', answer: 'y' });
await call(demo, 'PATCH', `/api/questions/translations/${tr1}`, { answer: ' Daniel and friends ' });
await call(demo, 'PATCH', `/api/questions/translations/${tr1}`, { prompt: 5 });
await call(demo, 'PATCH', `/api/questions/translations/nope`, { prompt: 'x' });
await call(demo, 'PATCH', `/api/questions/${q2}`, { number: 1 });
await call(demo, 'PATCH', `/api/questions/${q1}`, { maxPoints: 5, type: 'PG' });
await call(demo, 'PATCH', `/api/questions/${q1}`, { seconds: -1 });
await call(demo, 'PATCH', `/api/questions/${q1}`, { type: 'ZZ' });
await call(demo, 'PATCH', `/api/questions/nope`, { seconds: 5 });
await call(demo, 'GET', `${ev}/questions`);
await call(demo, 'GET', `${ev}/questions/export`);
await call(demo, 'DELETE', `/api/questions/translations/${tr1}`);
await call(demo, 'DELETE', `/api/questions/${q2}`);
await call(demo, 'DELETE', `/api/questions/nope`);
await call(demo, 'GET', `${ev}/questions`);

await call(
  demo,
  'POST',
  `${ev}/questions/import`,
  (() => {
    const f = new FormData();
    f.set('file', new File(['languages: []'], 'q.yaml'));
    return f;
  })(),
  'import into event with teams (invalid file)'
);
const I = (await call(demo, 'POST', '/api/events', { name: 'Import Target' })).id;
const iv = `/api/events/${I}`;
const goodYaml = new FormData();
goodYaml.set('file', new File([await Bun.file(yamlPath).text()], 'questions.yaml'));
await call(demo, 'POST', `${iv}/questions/import`, goodYaml);
const badName = new FormData();
badName.set('file', new File(['x'], 'questions.txt'));
await call(demo, 'POST', `${iv}/questions/import`, badName);
const badYaml = new FormData();
badYaml.set('file', new File(['languages: [\n'], 'q.yaml'));
await call(demo, 'POST', `${iv}/questions/import`, badYaml);
const invalid = new FormData();
invalid.set('file', new File(['languages: []\nquestions: []\n'], 'q.yaml'));
await call(demo, 'POST', `${iv}/questions/import`, invalid);
await call(demo, 'POST', `${iv}/questions/import`, new FormData());
await call(demo, 'GET', `${iv}/questions`);
await call(demo, 'GET', `${iv}/questions/export`);
const emptyEvent = (await call(demo, 'POST', '/api/events', { name: 'Empty' })).id;
await call(demo, 'GET', `/api/events/${emptyEvent}/questions/export`);
await call(demo, 'DELETE', `/api/events/${emptyEvent}`);

// Auth and users
const signup = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
};
await call(
  '',
  'POST',
  '/api/signup',
  signup({ email: email2, firstName: 'Sam', lastName: 'Judge', password: 'short' })
);
await call('', 'POST', '/api/signup', signup({ email: email2, firstName: 'Sam', lastName: 'Judge' }));
await call(
  '',
  'POST',
  '/api/signup',
  signup({ email: email2, firstName: 'Sam', lastName: 'Judge', password: 'smoke-password' })
);
await call(
  '',
  'POST',
  '/api/signup',
  signup({ email: email2, firstName: 'Sam', lastName: 'Judge', password: 'smoke-password' })
);
await login(email2, 'wrong-password');
await login('nobody@example.com', 'x');
await call('', 'POST', '/api/login', {}, 'login with no fields');
const sam = await login(email2, 'smoke-password');
const samId = (await call(demo, 'GET', `/api/users?email=${encodeURIComponent(email2)}`)).user.id;
await call(demo, 'GET', `/api/users?email=nobody@example.com`);
await call(demo, 'GET', `/api/users`);

// Permissions
await call(demo, 'POST', `${ev}/permissions`, { userId: samId, roleId: 'judge' });
await call(demo, 'POST', `${ev}/permissions`, { userId: samId });
await call(demo, 'GET', `${ev}/permissions`);
await call(demo, 'POST', `${iv}/permissions`, { userId: samId, roleId: 'judge' });
await call(sam, 'GET', `${ev}/answers`, undefined, 'judge GET answers');
await call(sam, 'GET', `${ev}/teams`, undefined, 'judge GET teams');
const importedQ = await call(demo, 'GET', `${iv}/questions`);
const someTranslation = Object.values(importedQ.questions as Record<string, any>)
  .flatMap((q: any) => Object.values(q.translations))
  .at(0) as any;
// Skipped when the import failed (older versions reject the example file), so the rest still runs.
if (someTranslation) {
  await call(
    sam,
    'PATCH',
    `/api/questions/translations/${someTranslation.id}`,
    { answer: 'judge edit' },
    'judge PATCH translation'
  );
} else {
  out.push('judge PATCH translation: skipped, nothing was imported');
}
await call(demo, 'PATCH', `${ev}/permissions`, { userId: samId, roleId: 'owner' });
await call(demo, 'PATCH', `${ev}/permissions`, { userId: samId, roleId: 'admin' });
await call(sam, 'GET', `${ev}/teams`, undefined, 'admin GET teams');

// Cross-event writes: Sam owns another event and aims at this event's team and language ids.
const own = (await call(sam, 'POST', '/api/events', { name: 'Sam Event' })).id;
await call(demo, 'DELETE', `${ev}/permissions`, { userId: samId });
await call(demo, 'DELETE', `${ev}/permissions`, {});
await call(demo, 'GET', `${ev}/permissions`);
await call(
  sam,
  'PATCH',
  `/api/events/${own}/teams`,
  { id: tB, name: 'Hijacked', number: 9, languageId: 'x' },
  'cross-event team PATCH'
);
await call(
  sam,
  'PATCH',
  `/api/events/${own}/languages`,
  { id: fr, code: 'zz', name: 'Hijacked' },
  'cross-event language PATCH'
);
await call(sam, 'DELETE', `/api/events/${own}/languages`, { id: fr }, 'cross-event language DELETE');
await call(demo, 'GET', `${ev}/languages`, undefined, 'languages after cross-event attempts');
await call(sam, 'DELETE', `/api/events/${own}/teams`, { id: tB }, 'cross-event team DELETE');
await call(demo, 'GET', `${ev}/teams`, undefined, 'teams after cross-event attempts');

// Profile
await call(sam, 'PATCH', '/api/users/me', { firstName: 'Samuel' });
await call(sam, 'PATCH', '/api/users/me', { email: 'demo@example.com' });
await call(sam, 'PATCH', '/api/users/me', {});
await call(sam, 'PATCH', '/api/users/me/password', { currentPassword: 'wrong', newPassword: 'smoke-password-2' });
await call(sam, 'PATCH', '/api/users/me/password', { currentPassword: 'smoke-password', newPassword: 'short' });
await call(sam, 'PATCH', '/api/users/me/password', { currentPassword: 'smoke-password' });
await call(sam, 'PATCH', '/api/users/me/password', {
  currentPassword: 'smoke-password',
  newPassword: 'smoke-password-2'
});
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const avatar = new FormData();
avatar.set('avatar', new File([png], 'a.png', { type: 'image/png' }));
await call(sam, 'POST', '/api/users/me/avatar', avatar);
const textAvatar = new FormData();
textAvatar.set('avatar', new File(['hi'], 'a.txt', { type: 'text/plain' }));
await call(sam, 'POST', '/api/users/me/avatar', textAvatar);
await call(sam, 'POST', '/api/users/me/avatar', new FormData());
await call(sam, 'GET', '/api/session');
await call(sam, 'DELETE', '/api/users/me/avatar');
await call(sam, 'GET', '/api/session');
await call(sam, 'DELETE', '/api/users/me');
await call(sam, 'GET', '/api/session', undefined, 'session after deleting the account');
await call(demo, 'GET', `/api/events/${own}`, undefined, "deleted user's event");
await call(demo, 'POST', '/api/logout', {});

const demo2 = await login('demo@example.com', 'demo-password');
await call(demo2, 'DELETE', ev);
await call(demo2, 'DELETE', iv);
await call(demo2, 'GET', '/api/events');

console.log(out.join('\n').replace(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>'));
process.exit(0);
