// The admin page's Users section (#58). Super admins only; every change goes to the audit log.
import { json, superAdmin } from '@/server/http/middleware';
import { badRequest, notFound, route } from '@/server/http/route';
import {
  createResetToken,
  getAdminUser,
  listUserEvents,
  RESET_LINK_HOURS,
  searchUsers,
  setUserDisabled,
  updateUserDetails,
  type AdminUserRow
} from '@/server/services/adminUsers';
import { logAdminAction } from '@/server/services/audit';
import { isEmailTaken } from '@/server/services/users';
import { endUserSessions } from '@/server/session';
import type { Routes } from '@/server/types';
import type { AdminUser, AdminUserResponse, AdminUsersResponse, ResetLinkResponse } from '@/types';
import { z } from 'zod';

const SEARCH_LIMIT = 50;

const iso = (date: Date | null) => (date ? new Date(date).toISOString() : null);

const toAdminUser = (row: AdminUserRow): AdminUser => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  isSuperAdmin: row.is_super_admin,
  disabledAt: iso(row.disabled_at),
  createdAt: iso(row.created_at)!,
  eventCount: row.event_count,
  sessionCount: row.session_count,
  lastActiveAt: iso(row.last_active_at)
});

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

const UserDetails = z.object({
  email: required('Email').pipe(z.email('Enter a valid email address.')),
  firstName: required('First name'),
  lastName: required('Last name')
});

async function findUser(id: string) {
  const user = await getAdminUser(id);

  if (!user) {
    throw notFound('User not found');
  }

  return user;
}

export const adminUserRoutes: Routes = {
  // ?q= matches email or name; no q lists everyone (the first 50 by email).
  '/api/admin/users': {
    GET: route(superAdmin(), async ({ req }): Promise<AdminUsersResponse> => {
      const query = new URL(req.url).searchParams.get('q') ?? '';
      const rows = await searchUsers(query, SEARCH_LIMIT + 1);

      return { users: rows.slice(0, SEARCH_LIMIT).map(toAdminUser), more: rows.length > SEARCH_LIMIT };
    })
  },

  '/api/admin/users/:id': {
    GET: route(superAdmin(), async ({ params: { id = '' } }): Promise<AdminUserResponse> => {
      const user = await findUser(id);
      const events = await listUserEvents(id);

      return {
        user: toAdminUser(user),
        events: events.map((event) => ({ id: event.id, name: event.name, role: event.role_id }))
      };
    }),

    // Edit name and email.
    PATCH: route(superAdmin(), json(UserDetails), async ({ params: { id = '' }, body, user: admin }) => {
      const user = await findUser(id);

      if (body.email !== user.email && (await isEmailTaken(body.email, id))) {
        throw badRequest('Another account already uses that email.');
      }

      const before = { email: user.email, firstName: user.first_name, lastName: user.last_name };
      const changes = Object.fromEntries(
        (Object.keys(before) as (keyof typeof before)[])
          .filter((field) => before[field] !== body[field])
          .map((field) => [field, { from: before[field], to: body[field] }])
      );

      if (Object.keys(changes).length > 0) {
        await updateUserDetails(id, body);
        await logAdminAction({ user: admin, action: 'user.update', target: user, details: { changes } });
      }

      return {};
    })
  },

  // A one-time link to set a new password, for the admin to send. Earlier links stop working.
  '/api/admin/users/:id/reset-link': {
    POST: route(superAdmin(), async ({ params: { id = '' }, user: admin }): Promise<ResetLinkResponse> => {
      const user = await findUser(id);
      const token = await createResetToken(id, admin.id);

      await logAdminAction({ user: admin, action: 'user.reset_link', target: user });

      return {
        path: `/reset-password/${token}`,
        expiresAt: new Date(Date.now() + RESET_LINK_HOURS * 3600_000).toISOString()
      };
    })
  },

  // Ends every session; their pages go back to the login page.
  '/api/admin/users/:id/sign-out': {
    POST: route(superAdmin(), async ({ params: { id = '' }, user: admin }) => {
      const user = await findUser(id);
      const sessions = await endUserSessions(id);

      await logAdminAction({ user: admin, action: 'user.sign_out', target: user, details: { sessions } });

      return { sessions };
    })
  },

  // Disabling also signs them out everywhere. You can't disable yourself.
  '/api/admin/users/:id/disable': {
    POST: route(superAdmin(), async ({ params: { id = '' }, user: admin }) => {
      const user = await findUser(id);

      if (id === admin.id) {
        throw badRequest('You can’t disable your own account.');
      }

      await setUserDisabled(id, true);
      await endUserSessions(id);
      await logAdminAction({ user: admin, action: 'user.disable', target: user });

      return {};
    })
  },

  '/api/admin/users/:id/enable': {
    POST: route(superAdmin(), async ({ params: { id = '' }, user: admin }) => {
      const user = await findUser(id);

      await setUserDisabled(id, false);
      await logAdminAction({ user: admin, action: 'user.enable', target: user });

      return {};
    })
  }
};
