import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import {
  apiBadRequest,
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';
import { type BunRequest, sql } from 'bun';

export const slidesRoutes: Routes = {
  '/api/events/:eventId/slides': {
    GET: async (req: BunRequest<'/api/events/:eventId/slides'>) => {
      const session = await getSession(req);
      if (!session) return apiUnauthorized();

      const { eventId } = req.params;

      try {
        // Check permissions
        const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

        if (permissions.length === 0) {
          return apiForbidden();
        }

        // Get event info
        const events: { name: string; title_remarks: string | null }[] = await sql`
          SELECT name, title_remarks FROM events WHERE id = ${eventId}
        `;

        if (events.length === 0) {
          return apiNotFound();
        }

        const event = events[0]!;

        const slides: { id: string; event_id: string; number: number; content: string; created_at: string }[] =
          await sql`
          SELECT id, event_id, number, content, created_at
          FROM slides
          WHERE event_id = ${eventId}
          ORDER BY number
        `;

        return apiData({
          eventName: event.name,
          titleRemarks: event.title_remarks || '',
          slides: slides.map((s) => ({
            id: s.id,
            eventId: s.event_id,
            number: s.number,
            content: s.content,
            createdAt: s.created_at
          }))
        });
      } catch (error) {
        console.error('Error fetching slides:', error);
        return apiServerError();
      }
    },

    POST: async (req: BunRequest<'/api/events/:eventId/slides'>) => {
      const session = await getSession(req);
      if (!session) return apiUnauthorized();

      const { eventId } = req.params;

      try {
        const body = await req.json();
        const { content } = body;

        if (typeof content !== 'string') {
          return apiBadRequest('Content must be a string');
        }

        // Check permissions
        const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

        if (permissions.length === 0) {
          return apiForbidden();
        }

        const slideId = Bun.randomUUIDv7();
        const result: { id: string; number: number }[] = await sql`
          INSERT INTO slides (id, event_id, number, content)
          VALUES (
            ${slideId},
            ${eventId},
            (SELECT COALESCE(MAX(number), 0) + 1 FROM slides WHERE event_id = ${eventId}),
            ${content}
          )
          RETURNING id, number
        `;

        if (result.length === 0) {
          return apiServerError();
        }

        return apiData({ slideId: result[0]!.id, number: result[0]!.number });
      } catch (error) {
        console.error('Error creating slide:', error);
        return apiServerError();
      }
    }
  },

  '/api/slides/:slideId': {
    PATCH: async (req: BunRequest<'/api/slides/:slideId'>) => {
      const session = await getSession(req);
      if (!session) return apiUnauthorized();

      const { slideId } = req.params;

      try {
        const body = await req.json();
        const { content } = body;

        if (!content || typeof content !== 'string') {
          return apiBadRequest('Content is required');
        }

        // Get slide to check event ownership
        const slides: { event_id: string }[] = await sql`
          SELECT event_id FROM slides WHERE id = ${slideId}
        `;

        if (slides.length === 0) {
          return apiNotFound();
        }

        const eventId = slides[0]!.event_id;

        // Check permissions
        const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

        if (permissions.length === 0) {
          return apiForbidden();
        }

        await sql`
          UPDATE slides SET content = ${content} WHERE id = ${slideId}
        `;

        return apiData();
      } catch (error) {
        console.error('Error updating slide:', error);
        return apiServerError();
      }
    },

    DELETE: async (req: BunRequest<'/api/slides/:slideId'>) => {
      const session = await getSession(req);

      if (!session) {
        return apiUnauthorized();
      }

      const { slideId } = req.params;

      try {
        // Get slide to check event ownership and get its number for renumbering
        const slides: { event_id: string; number: number }[] = await sql`
          SELECT event_id, number FROM slides WHERE id = ${slideId}
        `;

        if (slides.length === 0) {
          return apiNotFound();
        }

        const eventId = slides[0]!.event_id;
        const deletedSlideNumber = slides[0]!.number;

        // Check permissions
        const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

        if (permissions.length === 0) {
          return apiForbidden();
        }

        // Delete the slide and renumber remaining slides in a transaction
        await sql.begin(async (tx) => {
          await tx`
            DELETE FROM slides WHERE id = ${slideId}
          `;

          await tx`
            UPDATE slides
            SET number = number - 1
            WHERE event_id = ${eventId} AND number > ${deletedSlideNumber}
          `;
        });

        return apiData();
      } catch (error) {
        console.error('Error deleting slide:', error);
        return apiServerError();
      }
    }
  },

  '/api/events/:eventId/title-remarks': {
    PATCH: async (req: BunRequest<'/api/events/:eventId/title-remarks'>) => {
      const session = await getSession(req);
      if (!session) return apiUnauthorized();

      const { eventId } = req.params;

      try {
        const body = await req.json();
        const { titleRemarks } = body;

        if (typeof titleRemarks !== 'string') {
          return apiBadRequest('Title remarks must be a string');
        }

        // Check permissions
        const permissions: { role_id: string }[] = await sql`
          SELECT role_id FROM permissions
          WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

        if (permissions.length === 0) {
          return apiForbidden();
        }

        const result: { id: string }[] = await sql`
          UPDATE events SET title_remarks = ${titleRemarks} WHERE id = ${eventId} RETURNING id
        `;

        if (result.length === 0) {
          return apiNotFound();
        }

        return apiData();
      } catch (error) {
        console.error('Error updating title remarks:', error);
        return apiServerError();
      }
    }
  }
};
