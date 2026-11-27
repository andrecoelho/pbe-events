import { sql } from 'bun';

export interface Language {
  id: string;
  code: string;
  name: string;
}

export async function listLanguages(eventId: string): Promise<Language[]> {
  return await sql`SELECT id, code, name FROM languages WHERE event_id = ${eventId} ORDER BY code`;
}

// Keyed by language code, the shape the run screens use.
export async function getLanguagesByCode(eventId: string): Promise<Record<string, Language>> {
  const languages = await listLanguages(eventId);

  return Object.fromEntries(languages.map((language) => [language.code, language]));
}

// The event's languages with their timestamps, for the languages page.
export async function listLanguagesWithDates(eventId: string) {
  const rows: (Language & { event_id: string; created_at: Date })[] = await sql`
    SELECT id, code, name, event_id, created_at FROM languages WHERE event_id = ${eventId} ORDER BY code
  `;

  return rows;
}

// The id of the event's language with this code, if any.
export async function findLanguageByCode(eventId: string, code: string) {
  const rows: { id: string }[] = await sql`SELECT id FROM languages WHERE event_id = ${eventId} AND code = ${code}`;

  return rows[0]?.id ?? null;
}

export async function getLanguage(eventId: string, languageId: string): Promise<Language | null> {
  const rows: Language[] = await sql`
    SELECT id, code, name FROM languages WHERE id = ${languageId} AND event_id = ${eventId}
  `;

  return rows[0] ?? null;
}

export async function addLanguage(eventId: string, code: string, name: string) {
  const id = Bun.randomUUIDv7();

  await sql`INSERT INTO languages (id, event_id, code, name) VALUES (${id}, ${eventId}, ${code}, ${name})`;

  return id;
}

// Only touches the language if it belongs to the event. Returns whether it did.
export async function updateLanguage(eventId: string, languageId: string, code: string, name: string) {
  const rows = await sql`
    UPDATE languages SET code = ${code}, name = ${name} WHERE id = ${languageId} AND event_id = ${eventId} RETURNING id
  `;

  return rows.length > 0;
}

export async function deleteLanguage(eventId: string, languageId: string) {
  await sql`DELETE FROM languages WHERE id = ${languageId} AND event_id = ${eventId}`;
}
