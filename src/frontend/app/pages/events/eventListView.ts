// Which events the list shows, and in what order (#71, #72).
import type { EventListEntry } from '@/types';

export type EventSort = 'name' | 'newest' | 'tag';

export interface EventListFilters {
  // Matches the name or a tag.
  query: string;
  // Only events with this tag (ignoring case); null for all.
  tag: string | null;
  sort: EventSort;
  // Archived events are hidden unless this is on.
  showArchived: boolean;
}

type Entry = Pick<EventListEntry, 'name' | 'tags' | 'createdAt' | 'archivedAt'>;

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// Sorting by tag groups events by their tags (alphabetically, ignoring case); untagged events go last.
const tagKey = (e: Entry) =>
  [...e.tags]
    .map((t) => t.toLocaleLowerCase())
    .sort()
    .join('\u0000');

const SORTS: Record<EventSort, (a: Entry, b: Entry) => number> = {
  name: byName,
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b),
  tag: (a, b) => {
    const [ka, kb] = [tagKey(a), tagKey(b)];

    if (!ka !== !kb) {
      return ka ? -1 : 1;
    }

    return ka.localeCompare(kb) || byName(a, b);
  }
};

export function visibleEvents<E extends Entry>(events: readonly E[], filters: EventListFilters): E[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const tag = filters.tag?.toLocaleLowerCase() ?? null;

  return events
    .filter((e) => filters.showArchived || !e.archivedAt)
    .filter((e) => !tag || e.tags.some((t) => t.toLocaleLowerCase() === tag))
    .filter(
      (e) =>
        !query ||
        e.name.toLocaleLowerCase().includes(query) ||
        e.tags.some((t) => t.toLocaleLowerCase().includes(query))
    )
    .sort(SORTS[filters.sort]);
}
