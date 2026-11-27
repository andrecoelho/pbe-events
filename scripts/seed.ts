// Adds a demo user and a demo event to the local database, for trying the app, doc screenshots and browser tests.
// Run with `bun run db:seed` (after `bun run migrate` or `bun run db:reset`) on a local database,
// or `mise run db:seed:staging` on staging. Never production.
// Running it again replaces the demo user and event with fresh copies; nothing else is touched.
//
// Demo sign-in:
//   email:    demo@example.com
//   password: demo-password locally (a test value for local development only);
//             on staging, set once from SEED_DEMO_PASSWORD (kept in a password manager, not the repo).
//             Later staging runs keep the existing password unless SEED_DEMO_PASSWORD is set again.
// The demo user is a super admin, so the admin page (/admin) can be tried and tested.
import { sql } from 'bun';
import { requireLocalDatabase, requireStagingTunnel } from './local-db';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo-password';

const staging = process.argv.includes('--staging');
const target = staging ? requireStagingTunnel('db:seed') : requireLocalDatabase('db:seed');
const password = staging ? process.env.SEED_DEMO_PASSWORD : DEMO_PASSWORD;

const userId = 'seed-user-demo';
const eventId = 'seed-event-demo';

const languages = [
  { id: 'seed-lang-en', code: 'en', name: 'English' },
  { id: 'seed-lang-es', code: 'es', name: 'Español' }
] as const;

type Translation = { prompt: string; answer: string; clarification?: string };

// One of each question type. FB is one point per blank; blanks are 2+ underscores, answers joined with ' | '.
const questions: {
  type: 'PG' | 'PS' | 'TF' | 'FB';
  maxPoints: number;
  seconds: number;
  en: Translation;
  es: Translation;
}[] = [
  {
    type: 'PS',
    maxPoints: 1,
    seconds: 30,
    en: { prompt: 'According to Daniel 1, for how many days did Daniel ask to be tested?', answer: 'Ten days' },
    es: { prompt: 'Según Daniel 1, ¿por cuántos días pidió Daniel ser probado?', answer: 'Diez días' }
  },
  {
    type: 'PG',
    maxPoints: 4,
    seconds: 45,
    en: {
      prompt: 'Name the four young men from Judah chosen to serve in the king’s palace in Daniel 1.',
      answer: 'Daniel, Hananiah, Mishael, Azariah'
    },
    es: {
      prompt: 'Nombra a los cuatro jóvenes de Judá escogidos para servir en el palacio del rey en Daniel 1.',
      answer: 'Daniel, Ananías, Misael, Azarías'
    }
  },
  {
    type: 'TF',
    maxPoints: 1,
    seconds: 20,
    en: {
      prompt: 'In Daniel 6, Daniel was thrown into a den of lions.',
      answer: 'true',
      clarification: 'Daniel 6:16'
    },
    es: {
      prompt: 'En Daniel 6, Daniel fue echado en el foso de los leones.',
      answer: 'true',
      clarification: 'Daniel 6:16'
    }
  },
  {
    type: 'FB',
    maxPoints: 3,
    seconds: 40,
    en: {
      prompt: 'Daniel’s three friends were renamed ____, ____ and ____.',
      answer: 'Shadrach | Meshach | Abednego'
    },
    es: {
      prompt: 'A los tres amigos de Daniel les pusieron por nombre ____, ____ y ____.',
      answer: 'Sadrac | Mesac | Abed-nego'
    }
  },
  {
    type: 'FB',
    maxPoints: 1,
    seconds: 20,
    en: { prompt: 'The king of Babylon who besieged Jerusalem in Daniel 1 was ____.', answer: 'Nebuchadnezzar' },
    es: { prompt: 'El rey de Babilonia que sitió Jerusalén en Daniel 1 fue ____.', answer: 'Nabucodonosor' }
  }
];

const teams = [
  { number: 1, name: 'Eagles', lang: 'seed-lang-en' },
  { number: 2, name: 'Lions', lang: 'seed-lang-en' },
  { number: 3, name: 'Águilas', lang: 'seed-lang-es' }
];

const slides = [
  '# Welcome to the Demo Event\n\nGet ready: questions start in a moment.',
  '## Rules\n\n- Answer before the timer runs out\n- One answer per team'
];

// On staging without SEED_DEMO_PASSWORD, keep the demo user's current password.
const [current] = await sql`SELECT password FROM users WHERE id = ${userId}`;
const passwordHash = password ? await Bun.password.hash(password) : current?.password;

if (!passwordHash) {
  console.error('The demo user does not exist yet: set SEED_DEMO_PASSWORD (for this run only) to create it.');
  process.exit(1);
}

// Don't take over a real account that happens to use the demo email.
const [existing] = await sql`SELECT id FROM users WHERE email = ${DEMO_EMAIL} AND id <> ${userId}`;

if (existing && staging) {
  console.error(`${DEMO_EMAIL} is already a real account on staging; not replacing it.`);
  process.exit(1);
}

await sql.begin(async (tx) => {
  // Replace any earlier copy. Deleting the event cascades to everything in it.
  await tx`DELETE FROM events WHERE id = ${eventId}`;
  await tx`DELETE FROM users WHERE id = ${userId} OR email = ${DEMO_EMAIL}`;

  await tx`
    INSERT INTO users (id, email, password, first_name, last_name, is_super_admin)
    VALUES (${userId}, ${DEMO_EMAIL}, ${passwordHash}, 'Demo', 'Organizer', true)
  `;
  await tx`
    INSERT INTO events (id, name, title_remarks)
    VALUES (${eventId}, 'Demo Event', 'Daniel 1–6 · Practice round')
  `;
  await tx`INSERT INTO permissions (user_id, event_id, role_id) VALUES (${userId}, ${eventId}, 'owner')`;
  await tx`INSERT INTO runs (event_id, status, grace_period) VALUES (${eventId}, 'not_started', 2)`;

  for (const language of languages) {
    await tx`
      INSERT INTO languages (id, code, name, event_id)
      VALUES (${language.id}, ${language.code}, ${language.name}, ${eventId})
    `;
  }

  for (const [i, question] of questions.entries()) {
    const questionId = `seed-question-${i + 1}`;

    await tx`
      INSERT INTO questions (id, number, type, max_points, seconds, event_id)
      VALUES (${questionId}, ${i + 1}, ${question.type}, ${question.maxPoints}, ${question.seconds}, ${eventId})
    `;

    for (const language of languages) {
      const translation = question[language.code];

      await tx`
        INSERT INTO translations (id, prompt, answer, clarification, language_id, question_id)
        VALUES (
          ${`${questionId}-${language.code}`}, ${translation.prompt}, ${translation.answer},
          ${translation.clarification ?? null}, ${language.id}, ${questionId}
        )
      `;
    }
  }

  for (const team of teams) {
    await tx`
      INSERT INTO teams (id, number, name, event_id, language_id)
      VALUES (${`seed-team-${team.number}`}, ${team.number}, ${team.name}, ${eventId}, ${team.lang})
    `;
  }

  for (const [i, content] of slides.entries()) {
    await tx`
      INSERT INTO slides (id, event_id, number, content)
      VALUES (${`seed-slide-${i + 1}`}, ${eventId}, ${i + 1}, ${content})
    `;
  }
});

console.log(
  `Seeded ${target}: ${DEMO_EMAIL} owns "Demo Event" (${questions.length} questions, ${teams.length} teams, ${slides.length} slides)`
);
await sql.end();
