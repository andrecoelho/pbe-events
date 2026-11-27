import { formatJoinCode, joinLink, normalizeJoinCode } from '@/joinCode';
import { describe, expect, test } from 'bun:test';

describe('join codes', () => {
  test('accept what people type or paste', () => {
    expect(normalizeJoinCode('K7P4QX')).toBe('K7P4QX');
    expect(normalizeJoinCode('k7p-4qx')).toBe('K7P4QX');
    expect(normalizeJoinCode(' K7P 4QX ')).toBe('K7P4QX');
  });

  test('refuse anything that cannot be a code', () => {
    expect(normalizeJoinCode('')).toBeNull();
    expect(normalizeJoinCode('K7P4Q')).toBeNull();
    expect(normalizeJoinCode('K7P4QXY')).toBeNull();
    // Look-alikes are not in the alphabet: 0 O 1 I L.
    expect(normalizeJoinCode('K7P4Q0')).toBeNull();
    expect(normalizeJoinCode('K7P4QO')).toBeNull();
    expect(normalizeJoinCode('K7P4Q1')).toBeNull();
    expect(normalizeJoinCode('K7P4QI')).toBeNull();
    expect(normalizeJoinCode('K7P4QL')).toBeNull();
    expect(normalizeJoinCode("K7P'; --")).toBeNull();
  });

  test('show and link a code', () => {
    expect(formatJoinCode('K7P4QX')).toBe('K7P-4QX');
    expect(joinLink('https://example.com', 'K7P4QX')).toBe('https://example.com/join/K7P4QX');
  });
});
