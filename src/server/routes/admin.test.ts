import { describeActiveItem } from '@/server/routes/admin';
import type { ActiveItem } from '@/types';
import { describe, expect, test } from 'bun:test';

const prompt = {
  type: 'question',
  id: 'q3',
  number: 3,
  questionType: 'PG',
  maxPoints: 2,
  phase: 'prompt',
  seconds: 30,
  locked: false,
  graded: false,
  endsAt: null,
  pausedMs: null,
  isTimeUp: false,
  translations: [],
  answers: {}
} satisfies ActiveItem;

describe('describeActiveItem', () => {
  test('labels what the event shows', () => {
    expect(describeActiveItem(null)).toBeNull();
    expect(describeActiveItem({ type: 'title', title: 'PBE', remarks: null })).toBe('Title');
    expect(describeActiveItem({ type: 'slide', number: 2, content: '' })).toBe('Slide 2');
    expect(describeActiveItem({ ...prompt, phase: 'reading', translations: [] })).toBe('Question 3 · reading');
    expect(describeActiveItem(prompt)).toBe('Question 3 · answering');
    expect(describeActiveItem({ ...prompt, isTimeUp: true })).toBe('Question 3 · time up');
    expect(describeActiveItem({ ...prompt, isTimeUp: true, locked: true })).toBe('Question 3 · locked');
    expect(describeActiveItem({ ...prompt, locked: true, graded: true })).toBe('Question 3 · graded');
  });
});
