import { sql } from 'bun';
import type { Routes, Slide } from '@/server/types';
import { getSession } from '@/server/session';
import type { BunRequest } from 'bun';
import {
  apiBadRequest,
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';

export const slidesRoutes: Routes = {
  '/api/slides/:eventId': {
    GET: async (req: BunRequest<'/api/slides/:eventId'>) => {
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

        const slides: { id: string; event_id: string; number: number; content: string; created_at: string }[] =
          await sql`
          SELECT id, event_id, number, content, created_at
          FROM slides
          WHERE event_id = ${eventId}
          ORDER BY number
        `;

        return apiData({
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

    POST: async (req: BunRequest<'/api/slides/:eventId'>) => {
      const session = await getSession(req);
      if (!session) return apiUnauthorized();

      const { eventId } = req.params;

      try {
        const body = await req.json();
        const { content } = body;

        if (!content || typeof content !== 'string') {
          return apiBadRequest('Content is required');
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
        const result: { id: string }[] = await sql`
          INSERT INTO slides (id, event_id, number, content)
          VALUES (
            ${slideId},
            ${eventId},
            (SELECT COALESCE(MAX(number), 0) + 1 FROM slides WHERE event_id = ${eventId}),
            ${content}
          )
          RETURNING id
        `;

        if (result.length === 0) {
          return apiServerError();
        }

        return apiData({ slideId: result[0]!.id, ok: true });
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

        return apiData({ ok: true });
      } catch (error) {
        console.error('Error updating slide:', error);
        return apiServerError();
      }
    },

    DELETE: async (req: BunRequest<'/api/slides/:slideId'>) => {
      const session = await getSession(req);
      if (!session) return apiUnauthorized();

      const { slideId } = req.params;

      try {
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
          DELETE FROM slides WHERE id = ${slideId}
        `;

        return apiData({ ok: true });
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

        return apiData({ ok: true });
      } catch (error) {
        console.error('Error updating title remarks:', error);
        return apiServerError();
      }
    }
  }
};

