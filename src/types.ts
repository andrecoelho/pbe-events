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

// WebSocket close code for every socket of an event an admin reset in memory (#57). Pages reconnect as after
// a deploy, and the event's state is read again from the database.
export const EVENT_RESET_CLOSE_CODE = 4004;

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
  | { type: 'POINTS_UPDATED'; questionId: string; answerId: string; points: number | null }
  // Results screens only (#27): team totals may have changed, so reload them.
  | { type: 'RESULTS_CHANGED' };

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

export type ResultsClientMessage = Ping;

// Admin page (Phase 3): the events open in the server's memory and who is connected to each (#56).
export type LiveConnectionRole = 'host' | 'judge' | 'presenter' | 'results' | 'team';

// One open socket of a signed-in person (host, presenter, judge or results screen).
export type LiveConnection = {
  role: Exclude<LiveConnectionRole, 'team'>;
  name: string;
  email: string;
  userId: string;
  // Server time (ms since the epoch).
  connectedAt: number;
  // The last message other than a ping.
  lastMessageAt: number | null;
};

// A row of the admin page's list of open events.
export type LiveEventSummary = {
  eventId: string;
  eventName: string;
  runStatus: RunStatus;
  // What the presenter shows, e.g. "Question 3 · answering"; null before the run starts.
  activeItem: string | null;
  counts: Record<LiveConnectionRole, number>;
  // Every team in the event, and how many of them are reconnecting (their socket dropped a moment ago).
  teamCount: number;
  teamsReconnecting: number;
  lastMessageAt: number | null;
};

export type LiveConnectionsResponse = { serverTime: number; events: LiveEventSummary[] };

// Every team of an event, connected or not, on the admin page's event page.
export type AdminTeam = {
  id: string;
  number: number;
  name: string;
  languageCode: string | null;
  hasDevice: boolean;
  status: TeamConnectionStatus;
  lastSeenAt: number | null;
  // While connected.
  connectedAt: number | null;
  lastMessageAt: number | null;
};

// What the admin audit log records (#61).
export type AuditAction =
  | 'event.reset'
  | 'event.transfer'
  | 'event.join'
  | 'event.leave'
  | 'team.release_device'
  | 'user.update'
  | 'user.reset_link'
  | 'user.sign_out'
  | 'user.disable'
  | 'user.enable'
  | 'announcement.update'
  | 'announcement.clear';

// One entry of the admin audit log (#61).
export type AuditLogEntry = {
  id: string;
  createdAt: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  eventId: string | null;
  eventName: string | null;
  details: Record<string, unknown>;
};

// `nextBefore`: pass as `before` for older entries; null when there are none.
export type AuditLogResponse = { entries: AuditLogEntry[]; nextBefore: string | null };

// A user on the admin page's Users section (#58). Times are ISO strings.
export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  disabledAt: string | null;
  createdAt: string;
  eventCount: number;
  sessionCount: number;
  // To within a day (sessions are renewed daily); null when they've never signed in or it's long ago.
  lastActiveAt: string | null;
};

// `more`: there are more matches than shown; narrow the search.
export type AdminUsersResponse = { users: AdminUser[]; more: boolean };

export type AdminUserResponse = { user: AdminUser; events: { id: string; name: string; role: string }[] };

// A one-time password reset link (#58): the page's path, to put after the site's address.
export type ResetLinkResponse = { path: string; expiresAt: string };

// A row of the admin page's Events section (#59).
export type AdminEventListItem = {
  id: string;
  name: string;
  createdAt: string;
  owner: { email: string; name: string } | null;
  peopleCount: number;
  teamCount: number;
  questionCount: number;
  runStatus: RunStatus | null;
  // Open in the server's memory right now.
  live: boolean;
};

export type AdminEventsResponse = { events: AdminEventListItem[]; more: boolean };

export type AdminEventResponse = {
  serverTime: number;
  event: { id: string; name: string };
  // Everyone with a role on the event, owner first.
  people: { userId: string; name: string; email: string; role: 'owner' | 'admin' | 'judge' }[];
  // The viewer's own role on the event; null for a super admin who isn't in it.
  myRole: 'owner' | 'admin' | 'judge' | null;
  // Null when the event isn't open in the server's memory.
  live: { runStatus: RunStatus; activeItem: string | null; connections: LiveConnection[] } | null;
  teams: AdminTeam[];
};

// The admin page's Health section (#60). Times are ms since the epoch (server time).
export type HealthResponse = {
  serverTime: number;
  version: { commit: string | null; environment: string; bun: string; startedAt: number };
  process: { uptimeSeconds: number; rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
  // Null when the database couldn't be reached (`databaseError` says why).
  database: {
    latencyMs: number;
    sizeBytes: number;
    latestMigration: { name: string; appliedAt: string } | null;
  } | null;
  databaseError: string | null;
  live: { events: number; sockets: number };
  problems: {
    totals: { error: number; warn: number };
    recent: { time: number; level: 'error' | 'warn'; message: string }[];
  };
};

// The announcement banner (#62). `updatedAt` tells a changed message apart, so a dismissed one comes back when edited.
export type Announcement = {
  message: string;
  level: 'info' | 'warning';
  // ISO time after which it's hidden; null: until cleared.
  endsAt: string | null;
  updatedAt: string;
};

// What an event has so far (#69, #71): the home page's checklist and the event list's hint.
export type EventCounts = {
  languages: number;
  questions: number;
  // Questions without a translation in at least one of the event's languages.
  questionsMissingTranslations: number;
  teams: number;
  // Teams whose device joined with the join code.
  teamsJoined: number;
  slides: number;
  judges: number;
};

// An event's home page (#69): what's ready and what's missing, and whether it's live.
export type EventOverviewResponse = {
  counts: EventCounts;
  runStatus: RunStatus;
  // Teams connected right now (0 when the event isn't open in the server's memory).
  teamsConnected: number;
  // Every team's join code, for "Copy join codes".
  teams: { number: number; name: string; joinCode: string }[];
};

// A row of the event list (#71). `counts` is only there for owners and admins.
export type EventListEntry = {
  id: string;
  name: string;
  roleId: 'owner' | 'admin' | 'judge';
  createdAt: string;
  runStatus: RunStatus;
  counts: EventCounts | null;
};
