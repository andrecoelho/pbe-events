// The announcement banner (#62): anyone can read it (it's shown on the sign-in page too); super admins set it.
import { json, superAdmin } from '@/server/http/middleware';
import { badRequest, route } from '@/server/http/route';
import {
  clearAnnouncement,
  currentAnnouncement,
  getAnnouncement,
  saveAnnouncement
} from '@/server/services/announcement';
import { logAdminAction } from '@/server/services/audit';
import type { Routes } from '@/server/types';
import { z } from 'zod';

const MAX_LENGTH = 300;

const AnnouncementBody = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Write the message to show.')
    .max(MAX_LENGTH, `Keep the message under ${MAX_LENGTH} characters.`),
  level: z.enum(['info', 'warning'], { error: 'Choose Info or Warning.' }),
  endsAt: z.iso.datetime({ offset: true, error: 'The end time isn’t a valid date.' }).nullable()
});

export const announcementRoutes: Routes = {
  // What to show now, or null.
  '/api/announcement': {
    GET: route(async () => ({ announcement: await currentAnnouncement() }))
  },

  '/api/admin/announcement': {
    // As saved, even when its time is up.
    // As saved, even when its time is up; `showing` says whether pages show it now.
    GET: route(superAdmin(), async () => ({
      announcement: await getAnnouncement(),
      showing: (await currentAnnouncement()) !== null
    })),

    PUT: route(superAdmin(), json(AnnouncementBody), async ({ body, user }) => {
      if (body.endsAt && Date.parse(body.endsAt) <= Date.now()) {
        throw badRequest('The end time has already passed. Pick a later one, or none.');
      }

      await saveAnnouncement(body, user.id);
      await logAdminAction({
        user,
        action: 'announcement.update',
        details: { message: body.message, level: body.level }
      });

      return { announcement: await getAnnouncement(), showing: true };
    }),

    DELETE: route(superAdmin(), async ({ user }) => {
      const previous = await getAnnouncement();

      await clearAnnouncement();

      if (previous) {
        await logAdminAction({ user, action: 'announcement.clear', details: { message: previous.message } });
      }

      return {};
    })
  }
};
