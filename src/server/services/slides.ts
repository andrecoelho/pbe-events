import { sql } from 'bun';

export interface Slide {
  id: string;
  number: number;
  content: string;
}

export async function listSlides(eventId: string): Promise<Slide[]> {
  return await sql`SELECT id, number, content FROM slides WHERE event_id = ${eventId} ORDER BY number`;
}

export async function listSlidesWithDates(eventId: string) {
  const rows: (Slide & { event_id: string; created_at: Date })[] = await sql`
    SELECT id, event_id, number, content, created_at FROM slides WHERE event_id = ${eventId} ORDER BY number
  `;

  return rows;
}

// The id of the slide's event, or null when there's no such slide.
export async function getSlideEventId(slideId: string) {
  const rows: { event_id: string }[] = await sql`SELECT event_id FROM slides WHERE id = ${slideId}`;

  return rows[0]?.event_id ?? null;
}

// Adds the slide at the end.
export async function addSlide(eventId: string, content: string) {
  const rows: { id: string; number: number }[] = await sql`
    INSERT INTO slides (id, event_id, number, content)
    VALUES (${Bun.randomUUIDv7()}, ${eventId},
      (SELECT COALESCE(MAX(number), 0) + 1 FROM slides WHERE event_id = ${eventId}), ${content})
    RETURNING id, number
  `;

  return rows[0]!;
}

export async function updateSlide(slideId: string, content: string) {
  await sql`UPDATE slides SET content = ${content} WHERE id = ${slideId}`;
}

// Deletes the slide and closes the gap in the numbering.
export async function deleteSlide(eventId: string, slideId: string) {
  await sql.begin(async (tx) => {
    const rows: { number: number }[] = await tx`
      DELETE FROM slides WHERE id = ${slideId} AND event_id = ${eventId} RETURNING number
    `;
    const deleted = rows[0];

    if (deleted) {
      // Through negative numbers, so no two slides share a number midway (number is unique per event).
      await tx`UPDATE slides SET number = -(number - 1) WHERE event_id = ${eventId} AND number > ${deleted.number}`;
      await tx`UPDATE slides SET number = -number WHERE event_id = ${eventId} AND number < 0`;
    }
  });
}
