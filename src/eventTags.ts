// Event tags (#72), shared by the server (validation) and the event list (the tag editor).

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

// ' spring   regional ' → 'spring regional'; '' for blank.
export function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, ' ');
}

// Drops blanks and repeats (ignoring case, the first spelling wins), in the order given.
export function normalizeTags(tags: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const tag = normalizeTag(raw);
    const key = tag.toLocaleLowerCase();

    if (tag && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }

  return result;
}

// Why the tags can't be saved, or null.
export function tagsProblem(tags: readonly string[]) {
  if (tags.length > MAX_TAGS) {
    return `An event can have at most ${MAX_TAGS} tags.`;
  }

  const long = tags.find((tag) => tag.length > MAX_TAG_LENGTH);

  return long ? `“${long}” is too long. Tags can be at most ${MAX_TAG_LENGTH} characters.` : null;
}

// Every tag used by the events, sorted, each spelled as it first appears.
export function allTags(events: readonly { tags: readonly string[] }[]) {
  return normalizeTags(events.flatMap((event) => event.tags)).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}
