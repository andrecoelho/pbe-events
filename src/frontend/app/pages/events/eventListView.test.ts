import { describe, expect, test } from 'bun:test';
import { visibleEvents, type EventListFilters } from './eventListView';

const event = (name: string, tags: string[], createdAt: string, archivedAt: string | null = null) => ({
  name,
  tags,
  createdAt,
  archivedAt
});

const events = [
  event('Spring Regional', ['Regional', '2027'], '2026-11-01T00:00:00Z'),
  event('Area Practice', [], '2026-11-20T00:00:00Z'),
  event('NUC 2026', ['National'], '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z'),
  event('Fall Regional', ['regional'], '2026-10-01T00:00:00Z')
];

const filters = (over: Partial<EventListFilters> = {}): EventListFilters => ({
  query: '',
  tag: null,
  sort: 'name',
  showArchived: false,
  ...over
});

const names = (f: EventListFilters) => visibleEvents(events, f).map((e) => e.name);

describe('visibleEvents', () => {
  test('hides archived events unless asked', () => {
    expect(names(filters())).toEqual(['Area Practice', 'Fall Regional', 'Spring Regional']);
    expect(names(filters({ showArchived: true }))).toContain('NUC 2026');
  });

  test('filters by tag ignoring case', () => {
    expect(names(filters({ tag: 'REGIONAL' }))).toEqual(['Fall Regional', 'Spring Regional']);
  });

  test('searches names and tags', () => {
    expect(names(filters({ query: 'area' }))).toEqual(['Area Practice']);
    expect(names(filters({ query: '2027' }))).toEqual(['Spring Regional']);
  });

  test('sorts by newest', () => {
    expect(names(filters({ sort: 'newest' }))).toEqual(['Area Practice', 'Spring Regional', 'Fall Regional']);
  });

  test('sorts by tag, untagged last', () => {
    expect(names(filters({ sort: 'tag', showArchived: true }))).toEqual([
      'Spring Regional',
      'NUC 2026',
      'Fall Regional',
      'Area Practice'
    ]);
  });
});
