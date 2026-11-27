// Teams join an event with their team's code (#44). The first device to join gets a private token in an
// HttpOnly cookie, which the team's WebSocket sends; any other device is refused until the host releases it.
import { json, rateLimit } from '@/server/http/middleware';
import { conflict, notFound, route } from '@/server/http/route';
import {
  claimTeamDevice,
  getTeamByJoinCode,
  hashDeviceToken,
  newDeviceToken,
  TEAM_TOKEN_COOKIE
} from '@/server/services/teams';
import type { Routes } from '@/server/types';
import { getCookie, httpOnlyCookie } from '@/server/utils/cookies';
import { apiData } from '@/server/utils/responses';
import { normalizeJoinCode } from '@/joinCode';
import { z } from 'zod';

// A year (about the most browsers keep a cookie): the token only stops working when the host releases it.
const TEAM_TOKEN_MAX_AGE = 365 * 24 * 60 * 60;

const JoinRequest = z.object({ code: z.string({ error: 'Enter your team code' }) });

const unknownCode = () => notFound('That code doesn’t match any team. Check it and try again.');

export const joinRoutes: Routes = {
  '/api/join': {
    // Generous, since a whole venue can share one address; codes have about 887 million values.
    POST: route(rateLimit({ limit: 60, windowMs: 60_000 }), json(JoinRequest), async ({ req, body }) => {
      const code = normalizeJoinCode(body.code);

      if (!code) {
        throw unknownCode();
      }

      const team = await getTeamByJoinCode(code);

      if (!team) {
        throw unknownCode();
      }

      const joined = { event: { name: team.event_name }, team: { number: team.number, name: team.name } };
      const heldToken = getCookie(req, TEAM_TOKEN_COOKIE);

      // This device already holds the team (it opened the link again).
      if (heldToken && team.device_token_hash === hashDeviceToken(heldToken)) {
        return joined;
      }

      const token = newDeviceToken();

      if (!(await claimTeamDevice(team.id, token))) {
        throw conflict(`Team ${team.number} is already connected on another device. Ask the host to release it.`);
      }

      return apiData(joined, {
        'Set-Cookie': httpOnlyCookie(TEAM_TOKEN_COOKIE, token, ` Max-Age=${TEAM_TOKEN_MAX_AGE}`)
      });
    })
  }
};
