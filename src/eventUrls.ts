// The event workspace's URLs (#15): every page of an event lives under /events/:id/<section>.
// Shared by the server (redirecting the old URLs) and the organizer app (routes and the event menu).

export const EVENT_SECTIONS = [
  'languages',
  'questions',
  'teams',
  'slides',
  'permissions',
  'run',
  'grade',
  'results'
] as const;

export type EventSection = (typeof EVENT_SECTIONS)[number];

// /events/:id, or one of its sections.
export function eventUrl(eventId: string, section?: EventSection) {
  return section ? `/events/${eventId}/${section}` : `/events/${eventId}`;
}

// The event id in /events/:id and /events/:id/<section>, or undefined.
export function eventIdFromPath(pathname: string) {
  return pathname.match(/^\/events\/([^/]+)(?:\/[^/]*)?\/?$/)?.[1];
}

const LEGACY_PATH = new RegExp(`^/(${EVENT_SECTIONS.join('|')})/([^/]+)/?$`);

// Where an event page's URL from before the workspace (/questions/:id) moved to, or null for any other path.
export function movedEventUrl(pathname: string) {
  const match = pathname.match(LEGACY_PATH);

  return match ? eventUrl(match[2]!, match[1] as EventSection) : null;
}
