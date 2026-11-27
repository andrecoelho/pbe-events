import { describe, expect, test } from 'bun:test';
import { eventIdFromPath, eventUrl, movedEventUrl } from './eventUrls';

describe('eventUrl', () => {
  test('builds the home and section URLs', () => {
    expect(eventUrl('abc')).toBe('/events/abc');
    expect(eventUrl('abc', 'questions')).toBe('/events/abc/questions');
  });
});

describe('eventIdFromPath', () => {
  test('reads the id from the home and section URLs', () => {
    expect(eventIdFromPath('/events/abc')).toBe('abc');
    expect(eventIdFromPath('/events/abc/')).toBe('abc');
    expect(eventIdFromPath('/events/abc/teams')).toBe('abc');
  });

  test('ignores other paths', () => {
    expect(eventIdFromPath('/events')).toBeUndefined();
    expect(eventIdFromPath('/teams/abc')).toBeUndefined();
    expect(eventIdFromPath('/events/abc/teams/extra')).toBeUndefined();
  });
});

describe('movedEventUrl', () => {
  test('maps every old event page to its workspace URL', () => {
    expect(movedEventUrl('/questions/abc')).toBe('/events/abc/questions');
    expect(movedEventUrl('/run/abc/')).toBe('/events/abc/run');
    expect(movedEventUrl('/results/abc')).toBe('/events/abc/results');
  });

  test('leaves other paths alone', () => {
    expect(movedEventUrl('/')).toBeNull();
    expect(movedEventUrl('/settings')).toBeNull();
    expect(movedEventUrl('/questions')).toBeNull();
    expect(movedEventUrl('/admin/events/abc')).toBeNull();
    expect(movedEventUrl('/runs/abc')).toBeNull();
  });
});
