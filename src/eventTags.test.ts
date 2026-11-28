import { describe, expect, test } from 'bun:test';
import { allTags, MAX_TAGS, normalizeTags, tagsProblem } from './eventTags';

describe('normalizeTags', () => {
  test('trims, collapses spaces, and drops blanks and repeats ignoring case', () => {
    expect(normalizeTags(['  Spring   Regional ', '', '  ', 'spring regional', '2027', 'Teen'])).toEqual([
      'Spring Regional',
      '2027',
      'Teen'
    ]);
  });
});

describe('tagsProblem', () => {
  test('accepts up to the limit of short tags', () => {
    expect(tagsProblem([])).toBeNull();
    expect(tagsProblem(Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`))).toBeNull();
  });

  test('refuses too many or too long tags', () => {
    expect(tagsProblem(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`))).toContain('at most');
    expect(tagsProblem(['x'.repeat(31)])).toContain('too long');
  });
});

describe('allTags', () => {
  test('lists every tag once, sorted ignoring case', () => {
    expect(allTags([{ tags: ['regional', '2027'] }, { tags: ['Regional', 'Area'] }, { tags: [] }])).toEqual([
      '2027',
      'Area',
      'regional'
    ]);
  });
});
