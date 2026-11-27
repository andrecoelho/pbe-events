import { sql } from 'bun';

export interface Slide {
  id: string;
  number: number;
  content: string;
}

export async function listSlides(eventId: string): Promise<Slide[]> {
  return await sql`SELECT id, number, content FROM slides WHERE event_id = ${eventId} ORDER BY number`;
}
