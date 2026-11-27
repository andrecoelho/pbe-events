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
