import { recentProblems, recordProblem } from '@/server/recentErrors';
import { describe, expect, test } from 'bun:test';

describe('recent errors (#60)', () => {
  test('keeps the newest 50, counts them all, and formats them as plain text', () => {
    const before = recentProblems().totals;

    recordProblem('warn', ['\x1b[33mcolored\x1b[0m', { a: 1 }]);

    for (let i = 0; i < 60; i++) {
      recordProblem('error', [`failure ${i}`]);
    }

    recordProblem('error', ['[req-1] GET /api/x failed:', new Error('db down')]);

    const { entries, totals } = recentProblems();

    expect(entries).toHaveLength(50);
    expect(totals).toEqual({ error: before.error + 61, warn: before.warn + 1 });
    expect(entries[0]!.message).toStartWith('[req-1] GET /api/x failed: Error: db down');
    expect(entries[1]!.message).toBe('failure 59');
    expect(entries.some((e) => e.message.includes('colored'))).toBe(false);
  });

  test('strips colors', () => {
    recordProblem('warn', ['\x1b[31mred\x1b[0m text']);
    expect(recentProblems().entries[0]!.message).toBe('red text');
  });
});
