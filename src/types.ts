// Shared types used across server and frontend

// Discriminated union for active item types stored in runs.active_item JSONB column
export type ActiveItem =
  | { type: 'title'; title: string; remarks: string | null }
  | { type: 'slide'; number: number; content: string }
  | {
      type: 'question';
      id: string;
      number: number;
      questionType: 'PG' | 'PS' | 'TF' | 'FB';
      maxPoints: number;
      phase: 'reading';
      seconds: number;
      translations: Array<{ languageCode: string; prompt: string }>;
    }
  | {
      type: 'question';
      id: string;
      number: number;
      questionType: 'PG' | 'PS' | 'TF' | 'FB';
      maxPoints: number;
      phase: 'prompt';
      seconds: number;
      locked: boolean;
      graded: boolean;
      // The timer (#47), in server time (ms since the epoch): `endsAt` while it runs, `pausedMs` (time left)
      // while the run is paused, both null when there's no timer. Pages count down to `endsAt` on their own,
      // using their offset from the server clock (src/frontend/utils/serverClock.ts).
      endsAt: number | null;
      pausedMs: number | null;
      // Set by the server once the time and the grace period have passed; answers are refused from then on.
      isTimeUp: boolean;
      translations: Array<{ languageCode: string; prompt: string }>;
      answers: Record<
        string, // teamId
        {
          answerId: string | null;
          answerText: string | null;
          languageCode: string | null;
          teamId: string;
          teamNumber: number;
          points: number | null;
          autoPoints: number | null;
          challenged: boolean | null;
        }
      >;
    }
  | {
      type: 'question';
      id: string;
      number: number;
      phase: 'answer';
      locked: boolean;
      graded: boolean;
      translations: Array<{ languageCode: string; answer: string; clarification?: string | null }>;
      answers: Record<
        string, // teamId
        {
          answerId: string | null;
          answerText: string | null;
          languageCode: string | null;
          teamId: string;
          teamNumber: number;
          points: number | null;
          autoPoints: number | null;
          challenged: boolean | null;
        }
      >;
    };

// WebSocket close code for a host, judge or presenter socket whose session logged out or expired.
export const SESSION_ENDED_CLOSE_CODE = 4001;

// WebSocket close code for a team socket replaced by a newer one from the same device (another tab or window,
// #30). The replaced page stops reconnecting, so two tabs don't keep taking the team from each other.
export const TEAM_REPLACED_CLOSE_CODE = 4003;

// ---------------------------------------------------------------------------------------------------------
// Live run WebSocket messages (#55), shared so the server and the pages can't drift apart.
// docs/WEBSOCKET_ARCHITECTURE.md describes when each is sent.

export type RunStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';

export type LanguageInfo = { id: string; code: string; name: string };

// Connected; reconnecting for a while after its socket drops (its page keeps retrying); offline (#48).
export type TeamConnectionStatus = 'connected' | 'reconnecting' | 'offline';

// A team's entry in TEAM_STATUS (hosts only). Updates carry only the fields that changed.
export type TeamStatusUpdate = {
  id: string;
  number?: number;
  name?: string;
  languageCode?: string | null;
  joinCode?: string;
  hasDevice?: boolean;
  status?: TeamConnectionStatus;
  lastSeenAt?: number | null;
};

// Server → pages.
export type ServerMessage =
  // A socket the server refused when it opened (a team page: NOT_JOINED goes to /join; RELEASED by the host).
  | { type: 'CONNECTION_ERROR'; message: string; code?: 'NOT_JOINED' | 'RELEASED' }
  // A frame that wasn't valid (its ACK also says so).
  | { type: 'ERROR'; code: 'INVALID_MESSAGE'; message: string }
  | { type: 'EVENT_INFO'; event: { id: string; name: string } }
  | { type: 'TEAM_INFO'; team: { id: string; name: string; languageId: string; languageCode: string | null } }
  | { type: 'RUN_STATUS'; status: RunStatus }
  | { type: 'GRACE_PERIOD'; gracePeriod: number }
  | { type: 'LANGUAGES'; languages: Record<string, LanguageInfo> }
  // Teams get only their own answer in `answers`.
  | { type: 'ACTIVE_ITEM'; activeItem: ActiveItem | null }
  | { type: 'TEAM_STATUS'; teams: TeamStatusUpdate[] }
  | { type: 'QUESTION_LOCKED'; questionId: string; locked: boolean }
  | { type: 'QUESTION_GRADED'; questionId: string; graded: boolean }
  | { type: 'POINTS_UPDATED'; questionId: string; answerId: string; points: number | null };

// The server's answer to every page message that carried an `__ACK__` id (#53), with its clock (#47).
export type AckMessage = { type: 'ACK'; id: string; serverTime: number } & (
  | { ok: true }
  | { ok: false; error: string }
);

// Pages → server, by role. Every message may also carry `__ACK__` (WebSocketManager adds it).
type Ping = { type: 'PING' };

export type TeamClientMessage =
  | Ping
  // `questionId`: an answer resent after a reconnect is refused once its question has closed (#50).
  | { type: 'SUBMIT_ANSWER'; answer: string | boolean; questionId?: string }
  | { type: 'SUBMIT_CHALLENGE'; questionId: string; challenged: boolean };

export type HostClientMessage =
  | Ping
  | { type: 'UPDATE_RUN_STATUS'; status: RunStatus }
  | { type: 'UPDATE_GRACE_PERIOD'; gracePeriod: number }
  // The server sets the timer and reads the answers itself; the page's `answers` are ignored (#47, #54).
  | { type: 'SET_ACTIVE_ITEM'; activeItem: ActiveItem | null }
  | { type: 'SET_QUESTION_LOCKED'; questionId: string; locked: boolean }
  | { type: 'START_TIMER' }
  | { type: 'REMOVE_TIMER' }
  | { type: 'RELEASE_TEAM_DEVICE'; teamId: string }
  | { type: 'RENEW_JOIN_CODE'; teamId: string };

export type JudgeClientMessage =
  | Ping
  | { type: 'UPDATE_POINTS'; answerId: string; points: number | null; questionId?: string }
  | { type: 'SET_QUESTION_GRADED'; questionId: string; graded: boolean };

export type PresenterClientMessage = Ping;
