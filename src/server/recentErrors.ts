// The last errors and warnings the server logged, for the admin page's Health section (#60). Kept in memory, so a
// restart clears them. Everything written with console.error or console.warn is recorded: unexpected request errors
// (with their request id), WebSocket failures, refused messages.
import { inspect } from 'bun';

const MAX_ENTRIES = 50;
const MAX_LENGTH = 2000;

export type LoggedProblem = { time: number; level: 'error' | 'warn'; message: string };

const entries: LoggedProblem[] = [];
const totals = { error: 0, warn: 0 };

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

function format(args: unknown[]) {
  const text = args
    .map((arg) =>
      typeof arg === 'string' ? arg : arg instanceof Error ? (arg.stack ?? `${arg.name}: ${arg.message}`) : inspect(arg)
    )
    .join(' ')
    .replace(ANSI, '');

  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

export function recordProblem(level: LoggedProblem['level'], args: unknown[]) {
  totals[level]++;
  entries.unshift({ time: Date.now(), level, message: format(args) });
  entries.length = Math.min(entries.length, MAX_ENTRIES);
}

// Newest first.
export const recentProblems = () => ({ entries: [...entries], totals: { ...totals } });

let installed = false;

// Records console.error and console.warn from now on, still printing them as before. Call once at startup.
export function recordConsoleProblems() {
  if (installed) {
    return;
  }

  installed = true;

  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);

    console[level] = (...args: unknown[]) => {
      recordProblem(level, args);
      original(...args);
    };
  }
}
