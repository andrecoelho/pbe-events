import type { Session } from '@/server/types';
import { textServerError } from '@/server/utils/responses';
import type { ActiveItem, AckMessage, RunStatus, ServerMessage, TeamConnectionStatus } from '@/types';
import { saveAnswer, setAnswerChallenged, setAnswerPoints, withAnswers } from '@/server/services/answers';
import { eventExists } from '@/server/services/events';
import { getLanguagesByCode, type Language } from '@/server/services/languages';
import { ALL_ROLES, getEventForRoles, MANAGER_ROLES } from '@/server/services/permissions';
import { getTranslation, setQuestionGraded, setQuestionLocked } from '@/server/services/questions';
import { getRun, saveActiveItem, setGracePeriod, setRunStatus } from '@/server/services/runs';
import {
  getTeam,
  getTeamByDeviceToken,
  listTeams,
  releaseTeamDevice,
  renewJoinCode,
  TEAM_TOKEN_COOKIE,
  type Team
} from '@/server/services/teams';
import { getCookie } from '@/server/utils/cookies';
import { getLiveSessionIds, onSessionEnded } from '@/server/session';
import { SESSION_ENDED_CLOSE_CODE, TEAM_REPLACED_CLOSE_CODE } from '@/types';
import {
  HostMessage,
  JudgeMessage,
  MAX_MESSAGE_BYTES,
  parseMessage,
  PresenterMessage,
  TeamMessage
} from '@/server/webSocketMessages';
import type { ServerWebSocket } from 'bun';
import type { z } from 'zod';

export type TeamWebsocketData = {
  role: 'team';
  eventId: string;
  id: string;
  name: string;
  number: number;
  languageId: string;
  languageCode: string;
  // Set when the host released this device, so its disconnect shows as offline rather than reconnecting.
  released?: boolean;
};

export type HostWebsocketData = {
  role: 'host';
  session: Session;
  eventId: string;
};

export type JudgeWebsocketData = {
  role: 'judge';
  session: Session;
  eventId: string;
  wsId: string;
};

export type PresenterWebsocketData = {
  role: 'presenter';
  session: Session;
  eventId: string;
};

// The Results screen (#27): told when scores may have changed, so it reloads them.
export type ResultsWebsocketData = {
  role: 'results';
  session: Session;
  eventId: string;
};

export type ErrorWebsocketData = {
  role: 'error';
  message: string;
  // NOT_JOINED: a team socket from a device that hasn't joined a team (or was released).
  code?: 'NOT_JOINED';
};

type SignedInWebsocketData = HostWebsocketData | JudgeWebsocketData | PresenterWebsocketData | ResultsWebsocketData;

// How often signed-in sockets are checked for sessions that expired or were deleted.
const SESSION_CHECK_MS = 60_000;

// Set on every socket once it opens, for the admin page's live connections (#56). Server time (ms).
type SocketTimes = {
  connectedAt?: number;
  // The last message other than a PING (pages ping every few seconds to keep the socket open).
  lastMessageAt?: number;
};

export type WebsocketData = (
  | HostWebsocketData
  | PresenterWebsocketData
  | ResultsWebsocketData
  | TeamWebsocketData
  | JudgeWebsocketData
  | ErrorWebsocketData
) &
  SocketTimes;

// One open socket, as the admin page lists it (#56). The route adds the user's name.
export type LiveSocket = {
  role: Exclude<WebsocketData['role'], 'error'>;
  userId: string | null;
  team: { id: string; name: string; number: number } | null;
  connectedAt: number;
  lastMessageAt: number | null;
};

export type LiveEventState = {
  eventId: string;
  eventName: string;
  runStatus: RunStatus;
  activeItem: ActiveItem | null;
  sockets: LiveSocket[];
};

// What a message's ACK carries: whether it worked, and if not, why (shown to the person).
export type MessageResult = { ok: true } | { ok: false; error: string };

const refused = (error: string): MessageResult => ({ ok: false, error });

// Every message the server sends goes through here, so it must be one of the shared types (#55).
const encode = (message: ServerMessage | AckMessage) => JSON.stringify(message);

type PromptItem = Extract<ActiveItem, { type: 'question'; phase: 'prompt' }>;

// A team whose socket dropped shows as reconnecting this long (its page keeps retrying), then offline (#48).
const RECONNECTING_MS = 2 * 60_000;

// While a question's timer runs, its state is re-sent this often, in case a page missed a message (#47).
const RESEND_MS = 5000;

export interface EventConnection {
  eventId: string;
  // The event's messages, handled one at a time (see handleMessage).
  queue: Promise<void>;
  eventName: string;
  teams: Map<string, ServerWebSocket<TeamWebsocketData>>;
  run: Run;
  activeItem: ActiveItem | null;
  languages: Record<string, Language>;
  // The running question's timer (#47): fires once its time and grace period are up. While it runs, the state
  // is also re-sent every few seconds (resendTimer) as a safety net.
  timeUpTimer?: NodeJS.Timeout;
  resendTimer?: NodeJS.Timeout;
}

export interface Run {
  status: RunStatus;
  gracePeriod: number;
}

export class WebSocketServer {
  private eventConnections: Map<string, EventConnection>;
  private pendingSetups = new Map<string, Promise<EventConnection | null>>();
  // When each team was last connected, by event then team id (#48). Kept apart from the event's live state,
  // which is dropped when nobody is connected.
  private teamLastSeen = new Map<string, Map<string, number>>();
  private teamOfflineTimers = new Map<string, NodeJS.Timeout>();
  private server: Bun.Server<WebsocketData> | null = null;
  // Host, judge and presenter sockets by session id, so they can be closed when the session ends.
  private sessionSockets = new Map<string, Set<ServerWebSocket<SignedInWebsocketData>>>();
  // Every open socket by event id, for the admin page (#56).
  private eventSockets = new Map<string, Set<ServerWebSocket<WebsocketData>>>();

  constructor() {
    this.eventConnections = new Map();
  }

  setServer(server: Bun.Server<WebsocketData>) {
    this.server = server;

    onSessionEnded(this.closeSession);
    setInterval(this.closeEndedSessions, SESSION_CHECK_MS).unref();
  }

  private isSignedInWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<SignedInWebsocketData> {
    return (
      ws.data.role === 'host' || ws.data.role === 'judge' || ws.data.role === 'presenter' || ws.data.role === 'results'
    );
  }

  private trackSession(ws: ServerWebSocket<SignedInWebsocketData>) {
    const sessionId = ws.data.session.id;
    const sockets = this.sessionSockets.get(sessionId) ?? new Set();

    sockets.add(ws);
    this.sessionSockets.set(sessionId, sockets);
  }

  private untrackSession(ws: ServerWebSocket<SignedInWebsocketData>) {
    const sessionId = ws.data.session.id;
    const sockets = this.sessionSockets.get(sessionId);

    sockets?.delete(ws);

    if (sockets?.size === 0) {
      this.sessionSockets.delete(sessionId);
    }
  }

  // Closes the session's sockets; clients take the close code as a sign-out and don't reconnect.
  closeSession = (sessionId: string) => {
    const sockets = this.sessionSockets.get(sessionId);

    if (!sockets) {
      return;
    }

    console.log('Closing sockets of ended session', sessionId);
    this.sessionSockets.delete(sessionId);
    sockets.forEach((ws) => ws.close(SESSION_ENDED_CLOSE_CODE, 'Session ended'));
  };

  private closeEndedSessions = async () => {
    try {
      const live = await getLiveSessionIds([...this.sessionSockets.keys()]);

      for (const sessionId of this.sessionSockets.keys()) {
        if (!live.has(sessionId)) {
          this.closeSession(sessionId);
        }
      }
    } catch (error) {
      console.error('Checking WebSocket sessions failed', error);
    }
  };

  createHandlers() {
    return {
      data: {} as WebsocketData,
      open: this.handleOpen,
      close: this.handleClose,
      message: this.handleMessage,
      idleTimeout: 10,
      maxPayloadLength: MAX_MESSAGE_BYTES
    };
  }

  private isTeamWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<TeamWebsocketData> {
    return ws.data.role === 'team';
  }

  private isHostWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<HostWebsocketData> {
    return ws.data.role === 'host';
  }

  private isJudgeWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<JudgeWebsocketData> {
    return ws.data.role === 'judge';
  }

  private isPresenterWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<PresenterWebsocketData> {
    return ws.data.role === 'presenter';
  }

  async upgradeWebSocket(req: Request, session: Session | null): Promise<Response | undefined> {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');

    // An error socket only tells the client why (CONNECTION_ERROR) when it opens.
    const refuse = (message: string, code?: 'NOT_JOINED') => {
      this.server?.upgrade(req, { data: { role: 'error', message, code } });
      return undefined;
    };

    if (!role) {
      return refuse('Missing role in URL');
    }

    if (role !== 'host' && role !== 'team' && role !== 'presenter' && role !== 'judge' && role !== 'results') {
      return refuse('Invalid URL role');
    }

    // A team is identified by its device's token (from joining with the team's code, #44), which also
    // gives the event; the other roles name the event and sign in.
    let team: Team | null = null;
    let eventId: string | null;

    if (role === 'team') {
      const token = getCookie(req, TEAM_TOKEN_COOKIE);
      team = token ? await getTeamByDeviceToken(token) : null;

      if (!team) {
        return refuse('This device hasn’t joined a team. Join with your team’s code.', 'NOT_JOINED');
      }

      eventId = team.event_id;
    } else {
      eventId = url.searchParams.get('eventId');

      if (!eventId) {
        return refuse('Missing eventId in URL');
      }

      if (!(await eventExists(eventId))) {
        return refuse('Event not found');
      }
    }

    if (!(await this.getEventConnection(eventId))) {
      // Every event gets its run when it's created or copied, so this is damaged data.
      return refuse('This event is missing its run record, so it can’t be run. Ask an administrator to check it.');
    }

    if (role === 'host') {
      if (!session) {
        return refuse('Unauthorized');
      }

      if (!(await getEventForRoles(eventId, session.user_id, MANAGER_ROLES))) {
        return refuse('Host permission denied');
      }

      if (this.server?.upgrade(req, { data: { role: 'host', session, eventId } })) {
        return;
      }
    } else if (role === 'judge') {
      if (!session) {
        return refuse('Unauthorized');
      }

      if (!(await getEventForRoles(eventId, session.user_id, ALL_ROLES))) {
        return refuse('Judge permission denied');
      }

      if (this.server?.upgrade(req, { data: { role: 'judge', session, eventId, wsId: Bun.randomUUIDv7() } })) {
        return;
      }
    } else if (role === 'presenter') {
      if (!session) {
        return refuse('Unauthorized');
      }

      if (!(await getEventForRoles(eventId, session.user_id, MANAGER_ROLES))) {
        return refuse('Presenter permission denied');
      }

      if (this.server?.upgrade(req, { data: { role: 'presenter', session, eventId } })) {
        return;
      }
    } else if (role === 'results') {
      if (!session) {
        return refuse('Unauthorized');
      }

      // The same people who can open the results (GET /api/events/:id/results).
      if (!(await getEventForRoles(eventId, session.user_id, MANAGER_ROLES))) {
        return refuse('Results permission denied');
      }

      if (this.server?.upgrade(req, { data: { role: 'results', session, eventId } })) {
        return;
      }
    } else if (team) {
      // Only the device holding the token gets here, so an open socket for the team is this device's own
      // (a reload or a dropped connection): the new one replaces it.
      this.eventConnections
        .get(eventId)
        ?.teams.get(team.id)
        ?.close(TEAM_REPLACED_CLOSE_CODE, 'The team was opened in another tab');

      if (
        this.server?.upgrade(req, {
          data: {
            role: 'team',
            eventId,
            id: team.id,
            name: team.name,
            number: team.number,
            languageId: team.language_id,
            languageCode: team.language_code ?? ''
          }
        })
      ) {
        return;
      }
    }

    console.error('WebSocket upgrade failed', url.pathname, role);
    this.cleanUpEventConnection(eventId);
    return textServerError('WebSocket upgrade failed');
  }

  // The events open in memory and their sockets, for the admin page (#56).
  liveEvents(): LiveEventState[] {
    return [...this.eventConnections.values()].map(this.liveState);
  }

  // How many of the event's teams dropped a moment ago and are expected back (#48), for the admin page.
  teamsReconnecting(eventId: string) {
    return [...this.teamOfflineTimers.keys()].filter((key) => key.startsWith(`${eventId}:`)).length;
  }

  // One event's, or null when it isn't open in memory.
  liveEvent(eventId: string): LiveEventState | null {
    const connection = this.eventConnections.get(eventId);

    return connection ? this.liveState(connection) : null;
  }

  private liveState = (connection: EventConnection): LiveEventState => ({
    eventId: connection.eventId,
    eventName: connection.eventName,
    runStatus: connection.run.status,
    activeItem: connection.activeItem,
    sockets: [...(this.eventSockets.get(connection.eventId) ?? [])].flatMap((ws): LiveSocket[] => {
      const { data } = ws;

      if (data.role === 'error') {
        return [];
      }

      return [
        {
          role: data.role,
          userId: data.role === 'team' ? null : data.session.user_id,
          team: data.role === 'team' ? { id: data.id, name: data.name, number: data.number } : null,
          connectedAt: data.connectedAt ?? Date.now(),
          lastMessageAt: data.lastMessageAt ?? null
        }
      ];
    })
  });

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { role } = ws.data;

    if (role === 'error') {
      ws.send(encode({ type: 'CONNECTION_ERROR', message: ws.data.message, code: ws.data.code }));
      return;
    }

    const { eventId } = ws.data as Exclude<WebsocketData, ErrorWebsocketData>;

    // A socket this one replaced (the same team device reconnecting) may have cleaned the connection up.
    const connection = await this.getEventConnection(eventId);

    if (!connection) {
      console.error('No event connection found for eventId', eventId, ws.data);
      ws.close();
      return;
    }

    ws.data.connectedAt = Date.now();

    const sockets = this.eventSockets.get(eventId) ?? new Set();

    sockets.add(ws);
    this.eventSockets.set(eventId, sockets);

    if (this.isSignedInWebSocket(ws)) {
      this.trackSession(ws);
    }

    if (this.isHostWebSocket(ws)) {
      ws.subscribe(`${eventId}:hosts`);
      this.sendTeamStatuses(ws, connection);
      this.sendActiveItem(ws, connection);
      console.log('Host connected for event', eventId);

      if (connection.teams.size > 0) {
        console.log(
          '    Teams:\n',
          Array.from(connection.teams)
            .map(([id, teamWs]) => `\t${id}: ${teamWs.data.name}`)
            .join('\n')
        );
      }
    } else if (this.isJudgeWebSocket(ws)) {
      ws.subscribe(`${eventId}:judges`);
      this.sendLanguages(ws, connection);
      this.sendRunStatus(ws, connection);
      this.sendActiveItem(ws, connection);
      console.log('Judge connected for event', eventId);
    } else if (this.isPresenterWebSocket(ws)) {
      this.sendLanguages(ws, connection);
      this.sendRunStatus(ws, connection);
      this.sendActiveItem(ws, connection);
      ws.subscribe(`${eventId}:presenters`);
      console.log('Presenter connected for event', eventId);
    } else if (ws.data.role === 'results') {
      ws.subscribe(`${eventId}:results`);
    } else if (this.isTeamWebSocket(ws)) {
      const { id } = ws.data;

      // Get team details including language
      const team = await getTeam(eventId, id);

      if (team) {
        connection.teams.set(id, ws);

        ws.data.languageId = team.language_id;
        ws.data.languageCode = team.language_code ?? '';

        ws.send(encode({ type: 'EVENT_INFO', event: { id: eventId, name: connection.eventName } }));

        ws.send(
          encode({
            type: 'TEAM_INFO',
            team: { id, name: team.name, languageId: ws.data.languageId, languageCode: team.language_code }
          })
        );

        ws.subscribe(`${eventId}:teams`);
        ws.subscribe(`${eventId}:team:${id}`);

        this.sendLanguages(ws, connection);
        this.sendRunStatus(ws, connection);
        this.sendActiveItem(ws, connection);
        this.sendGracePeriod(ws, connection);

        this.markTeamSeen(eventId, id);
        clearTimeout(this.teamOfflineTimers.get(`${eventId}:${id}`));

        this.server?.publish(
          `${eventId}:hosts`,
          encode({ type: 'TEAM_STATUS', teams: [this.teamStatus(connection, team)] })
        );

        console.log(`Team ${team.number} connected for event`, eventId, id);
      } else {
        ws.close();
        console.error('Team not found during WebSocket open for event', eventId, id);
      }
    }
  };

  // Called when a WebSocket connection is closed
  private handleClose = async (ws: ServerWebSocket<WebsocketData>) => {
    const { role } = ws.data;

    if (role === 'error') {
      return;
    }

    if (this.isSignedInWebSocket(ws)) {
      this.untrackSession(ws);
    }

    const { eventId } = ws.data;

    if (!eventId) {
      return;
    }

    const sockets = this.eventSockets.get(eventId);

    sockets?.delete(ws);

    if (sockets?.size === 0) {
      this.eventSockets.delete(eventId);
    }

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    if (role === 'team') {
      const { id, number } = ws.data;

      // A socket the same device replaced (a reload) closes after its replacement took over: leave that alone.
      if (connection.teams.get(id) === ws) {
        connection.teams.delete(id);
        this.markTeamSeen(eventId, id);

        // A released device won't come back; any other is retrying, so it's reconnecting for a while.
        const status: TeamConnectionStatus = ws.data.released ? 'offline' : 'reconnecting';

        this.publishTeamConnection(eventId, id, number, status);

        if (status === 'reconnecting') {
          const key = `${eventId}:${id}`;

          clearTimeout(this.teamOfflineTimers.get(key));
          this.teamOfflineTimers.set(
            key,
            setTimeout(() => {
              this.teamOfflineTimers.delete(key);

              if (!this.eventConnections.get(eventId)?.teams.has(id)) {
                this.publishTeamConnection(eventId, id, number, 'offline');
              }
            }, RECONNECTING_MS)
          );
        }

        console.log(`Team ${number} disconnected for event`, eventId, id);
      }
    }

    this.cleanUpEventConnection(eventId);
  };

  // Called when a WebSocket message is received
  // Called when a WebSocket message is received. An event's messages are handled one at a time, in the order
  // they arrive, so back-to-back messages (e.g. a run status then a grace period) can't overtake each other.
  private handleMessage = (ws: ServerWebSocket<WebsocketData>, message: string | Buffer) => {
    if (ws.data.role === 'error') {
      return;
    }

    const connection = this.eventConnections.get(ws.data.eventId);

    if (!connection) {
      return;
    }

    connection.queue = connection.queue.then(() => this.processMessage(ws, connection, message));
  };

  // Handles one message, then ACKs it with the result: { ok: true } once its writes are done, or { ok: false,
  // error } saying why nothing changed.
  private async processMessage(ws: ServerWebSocket<WebsocketData>, connection: EventConnection, raw: string | Buffer) {
    const msg = this.isTeamWebSocket(ws)
      ? this.parse(ws, TeamMessage, raw)
      : this.isHostWebSocket(ws)
        ? this.parse(ws, HostMessage, raw)
        : this.isJudgeWebSocket(ws)
          ? this.parse(ws, JudgeMessage, raw)
          : this.parse(ws, PresenterMessage, raw);

    if (!msg) {
      return;
    }

    if (msg.type !== 'PING') {
      ws.data.lastMessageAt = Date.now();
    }

    let result: MessageResult | void;

    try {
      result = await this.dispatch(ws, connection, msg);
    } catch (error) {
      console.error(`WebSocket ${ws.data.role} ${msg.type} failed for event`, connection.eventId, error);
      result = refused('Something went wrong on the server. Try again.');
    }

    this.sendAck(ws, msg['__ACK__'], result ?? { ok: true });
  }

  private async dispatch(
    ws: ServerWebSocket<WebsocketData>,
    connection: EventConnection,
    msg: z.infer<typeof TeamMessage | typeof HostMessage | typeof JudgeMessage | typeof PresenterMessage>
  ): Promise<MessageResult | void> {
    if (msg.type === 'PING') {
      return;
    }

    if (this.isTeamWebSocket(ws)) {
      switch (msg.type) {
        case 'SUBMIT_ANSWER':
          return await this.handleSUBMIT_ANSWER(ws, connection, msg.answer, msg.questionId);
        case 'SUBMIT_CHALLENGE':
          return await this.handleSUBMIT_CHALLENGE(ws, connection, msg.questionId, msg.challenged);
      }
    } else if (this.isHostWebSocket(ws)) {
      switch (msg.type) {
        case 'UPDATE_RUN_STATUS':
          return await this.handleUPDATE_RUN_STATUS(connection, msg.status);
        case 'UPDATE_GRACE_PERIOD':
          return await this.handleUPDATE_GRACE_PERIOD(connection, msg.gracePeriod);
        case 'SET_ACTIVE_ITEM':
          return await this.handleSET_ACTIVE_ITEM(connection, msg.activeItem);
        case 'SET_QUESTION_LOCKED':
          return await this.handleSET_QUESTION_LOCKED(connection, msg.questionId, msg.locked);
        case 'START_TIMER':
          return await this.handleSTART_TIMER(connection);
        case 'REMOVE_TIMER':
          return await this.handleREMOVE_TIMER(connection);
        case 'RELEASE_TEAM_DEVICE':
          return await this.handleRELEASE_TEAM_DEVICE(connection, msg.teamId);
        case 'RENEW_JOIN_CODE':
          return await this.handleRENEW_JOIN_CODE(connection, msg.teamId);
      }
    } else if (this.isJudgeWebSocket(ws)) {
      switch (msg.type) {
        case 'UPDATE_POINTS':
          return await this.handleUPDATE_POINTS(connection, msg.answerId, msg.points);
        case 'SET_QUESTION_GRADED':
          return await this.handleSET_QUESTION_GRADED(connection, msg.questionId, msg.graded);
      }
    }
  }

  private sendAck(ws: ServerWebSocket<WebsocketData>, ackId: string | undefined, result: MessageResult) {
    if (ackId !== undefined) {
      // serverTime lets pages measure their offset from the server clock (#47).
      ws.send(encode({ type: 'ACK', id: ackId, serverTime: Date.now(), ...result }));
    }
  }

  // Parses a frame with the role's schema. An invalid one gets an INVALID_MESSAGE error (and its ACK, so the
  // client doesn't take it for a lost connection) and returns null.
  private parse<T extends z.ZodType>(ws: ServerWebSocket<WebsocketData>, schema: T, raw: string | Buffer) {
    const result = parseMessage(schema, raw);

    if (result.ok) {
      return result.message;
    }

    console.warn(`Invalid WebSocket message from ${ws.data.role}:`, result.error);
    ws.send(encode({ type: 'ERROR', code: 'INVALID_MESSAGE', message: result.error }));
    this.sendAck(ws, result.ack, refused(result.error));

    return null;
  }

  private cleanUpEventConnection(eventId: string): void {
    const connection = this.eventConnections.get(eventId);
    const hostCount = this.server?.subscriberCount(`${eventId}:hosts`);
    const presenterCount = this.server?.subscriberCount(`${eventId}:presenters`);
    const judgeCount = this.server?.subscriberCount(`${eventId}:judges`);
    const teamCount = this.server?.subscriberCount(`${eventId}:teams`);
    const resultsCount = this.server?.subscriberCount(`${eventId}:results`);

    if (
      connection &&
      hostCount === 0 &&
      presenterCount === 0 &&
      judgeCount === 0 &&
      teamCount === 0 &&
      resultsCount === 0
    ) {
      console.log('Cleaning up event connection:', eventId);
      this.clearTimer(connection);
      this.eventConnections.delete(eventId);
    }
  }

  // The event's live state, set up from the database on first use. Connections that arrive together share
  // one setup (#52), so a second setup can't replace the first and lose the sockets already registered on it.
  // Null when the event has no run.
  private getEventConnection(eventId: string): Promise<EventConnection | null> {
    const existing = this.eventConnections.get(eventId);

    if (existing) {
      return Promise.resolve(existing);
    }

    let setup = this.pendingSetups.get(eventId);

    if (!setup) {
      setup = this.setUpEventConnection(eventId).finally(() => this.pendingSetups.delete(eventId));
      this.pendingSetups.set(eventId, setup);
    }

    return setup;
  }

  private async setUpEventConnection(eventId: string): Promise<EventConnection | null> {
    const run = await getRun(eventId);

    if (!run) {
      return null;
    }

    // An event without languages can still show its title and slides; teams need a language, so it has none.
    const languages = await getLanguagesByCode(eventId);

    // An open question saved before #47 has startTime/remainingSeconds instead: treat it as having no timer.
    const activeItem = run.active_item;

    if (activeItem?.type === 'question' && activeItem.phase === 'prompt') {
      activeItem.endsAt ??= null;
      activeItem.pausedMs ??= null;
    }

    console.log('Initializing event connection for eventId', eventId);

    const connection: EventConnection = {
      eventId,
      queue: Promise.resolve(),
      eventName: run.event_name,
      teams: new Map(),
      run: {
        status: run.status,
        gracePeriod: run.grace_period
      },
      activeItem,
      languages
    };

    this.eventConnections.set(eventId, connection);

    // A question that was open when the server restarted keeps its deadline (or is marked time up).
    this.scheduleTimeUp(connection);

    return connection;
  }

  sendActiveItem(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    const activeItem = connection.activeItem;

    if (ws.data.role === 'team' && activeItem && 'answers' in activeItem) {
      const team = ws.data;
      // A team sees only its own answer.
      const own = activeItem.answers[team.id];
      const answers = own ? { [team.id]: own } : {};

      ws.send(
        encode({
          type: 'ACTIVE_ITEM',
          activeItem: { ...activeItem, answers }
        })
      );
    } else {
      ws.send(encode({ type: 'ACTIVE_ITEM', activeItem }));
    }
  }

  sendRunStatus(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(encode({ type: 'RUN_STATUS', status: connection.run.status }));
  }

  sendLanguages(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(encode({ type: 'LANGUAGES', languages: connection.languages }));
  }

  async sendTeamStatuses(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): Promise<void> {
    const teams = await listTeams(connection.eventId);

    const teamStatuses = teams.map((team) => this.teamStatus(connection, team));

    ws.send(encode({ type: 'TEAM_STATUS', teams: teamStatuses }));
  }

  private markTeamSeen(eventId: string, teamId: string) {
    const seen = this.teamLastSeen.get(eventId) ?? new Map<string, number>();

    seen.set(teamId, Date.now());
    this.teamLastSeen.set(eventId, seen);
  }

  // Connected; reconnecting within RECONNECTING_MS of last being seen (its page keeps retrying); else offline.
  // Also read by the admin page (#56), for events that may not be open.
  teamConnection(eventId: string, teamId: string) {
    const lastSeenAt = this.teamLastSeen.get(eventId)?.get(teamId) ?? null;
    const status: TeamConnectionStatus = this.eventConnections.get(eventId)?.teams.has(teamId)
      ? 'connected'
      : lastSeenAt !== null &&
          Date.now() - lastSeenAt < RECONNECTING_MS &&
          this.teamOfflineTimers.has(`${eventId}:${teamId}`)
        ? 'reconnecting'
        : 'offline';

    return { status, lastSeenAt };
  }

  private publishTeamConnection(eventId: string, id: string, number: number, status: TeamConnectionStatus) {
    const lastSeenAt = this.teamLastSeen.get(eventId)?.get(id) ?? null;

    this.server?.publish(
      `${eventId}:hosts`,
      encode({ type: 'TEAM_STATUS', teams: [{ id, number, status, lastSeenAt }] })
    );
  }

  // A team's entry in TEAM_STATUS (sent to hosts only: it has the join code).
  private teamStatus(connection: EventConnection, team: Team) {
    return {
      id: team.id,
      number: team.number,
      name: team.name,
      languageCode: team.language_code,
      joinCode: team.join_code,
      hasDevice: team.has_device,
      ...this.teamConnection(connection.eventId, team.id)
    };
  }

  sendGracePeriod(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(encode({ type: 'GRACE_PERIOD', gracePeriod: connection.run.gracePeriod }));
  }

  broadcastToAll(connection: EventConnection, message: string): void {
    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
    this.server?.publish(`${connection.eventId}:teams`, message);
  }

  broadcastToManagers(connection: EventConnection, message: string): void {
    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
  }

  broadcastActiveItemToManagers(connection: EventConnection) {
    const message = encode({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
  }

  broadcastActiveItemToAll(connection: EventConnection) {
    const activeItem = connection.activeItem;
    const message = encode({ type: 'ACTIVE_ITEM', activeItem });

    this.broadcastActiveItemToManagers(connection);

    if (activeItem?.type === 'question' && 'answers' in activeItem) {
      connection.teams.forEach((teamWs) => this.sendActiveItem(teamWs, connection));
    } else {
      this.server?.publish(`${connection.eventId}:teams`, message);
    }
  }

  async saveActiveItem(connection: EventConnection, activeItem: ActiveItem | null): Promise<void> {
    await saveActiveItem(connection.eventId, activeItem);
  }

  // Timer (#47). The server only keeps a deadline (`endsAt`, server time) and broadcasts it when it changes;
  // pages count down on their own. One timeout marks the time up once the grace period has passed.

  private clearTimer(connection: EventConnection): void {
    clearTimeout(connection.timeUpTimer);
    clearInterval(connection.resendTimer);
    connection.timeUpTimer = undefined;
    connection.resendTimer = undefined;
  }

  private promptItem(connection: EventConnection) {
    const item = connection.activeItem;

    return item?.type === 'question' && item.phase === 'prompt' ? item : null;
  }

  // Schedules the time-up for the running question (or marks it at once when it's already past).
  private scheduleTimeUp(connection: EventConnection): void {
    this.clearTimer(connection);

    const item = this.promptItem(connection);

    if (!item || item.endsAt === null || item.isTimeUp) {
      return;
    }

    const delay = Math.max(item.endsAt + connection.run.gracePeriod * 1000 - Date.now(), 0);

    // Through the event's queue, so the time-up can't interleave with a message changing the active item.
    connection.timeUpTimer = setTimeout(() => {
      connection.queue = connection.queue.then(() =>
        this.markTimeUp(connection).catch((error) => console.error('Timer failed for event', connection.eventId, error))
      );
    }, delay);

    connection.resendTimer = setInterval(() => this.broadcastActiveItemToAll(connection), RESEND_MS);
  }

  private async markTimeUp(connection: EventConnection): Promise<void> {
    const item = this.promptItem(connection);

    if (!item || item.endsAt === null || item.isTimeUp) {
      return;
    }

    // A grace period lengthened since this was scheduled moves the time-up later.
    if (Date.now() < item.endsAt + connection.run.gracePeriod * 1000) {
      this.scheduleTimeUp(connection);
      return;
    }

    this.clearTimer(connection);
    item.isTimeUp = true;

    await this.saveActiveItem(connection, item);
    this.broadcastActiveItemToAll(connection);
  }

  // Starts (or restarts) the prompt's full time. While the run is paused it waits, paused, with its full time.
  private startTimer(connection: EventConnection, item: PromptItem): void {
    const ms = item.seconds * 1000;
    const paused = connection.run.status === 'paused';

    item.endsAt = paused ? null : Date.now() + ms;
    item.pausedMs = paused ? ms : null;
    item.isTimeUp = false;
  }

  // Pausing the run keeps the time left; resuming gives every page the same new deadline (#25).
  private async pauseOrResumeTimer(connection: EventConnection, status: RunStatus): Promise<void> {
    const item = this.promptItem(connection);

    if (!item || item.isTimeUp) {
      return;
    }

    if (status === 'paused' && item.endsAt !== null) {
      item.pausedMs = Math.max(item.endsAt - Date.now(), 0);
      item.endsAt = null;
    } else if (status === 'in_progress' && item.pausedMs !== null) {
      item.endsAt = Date.now() + item.pausedMs;
      item.pausedMs = null;
    } else {
      return;
    }

    await this.saveActiveItem(connection, item);
    this.scheduleTimeUp(connection);
    this.broadcastActiveItemToAll(connection);
  }

  private async handleSUBMIT_ANSWER(
    ws: ServerWebSocket<TeamWebsocketData>,
    connection: EventConnection,
    answerText: string,
    questionId: string | undefined
  ): Promise<MessageResult | void> {
    const { id, languageId } = ws.data;
    const activeItem = connection.activeItem;

    if (activeItem?.type !== 'question' || activeItem.phase !== 'prompt') {
      return refused('The question isn’t open for answers right now.');
    }

    if (questionId !== undefined && questionId !== activeItem.id) {
      return refused('That question has closed: your answer wasn’t saved.');
    }

    if (
      activeItem.isTimeUp ||
      (activeItem.endsAt !== null && Date.now() >= activeItem.endsAt + connection.run.gracePeriod * 1000)
    ) {
      return refused('Time is up: your answer wasn’t saved.');
    }

    if (activeItem.locked) {
      return refused('The host locked the question: your answer wasn’t saved.');
    }

    const translation = await getTranslation(activeItem.id, languageId);

    if (!translation) {
      return refused('This question has no translation in your team’s language. Tell the host.');
    }

    const answerId = await saveAnswer({
      questionId: activeItem.id,
      teamId: id,
      translationId: translation.id,
      text: answerText
    });

    activeItem.answers[id] = {
      answerId,
      teamId: id,
      teamNumber: ws.data.number,
      languageCode: translation.language_code,
      answerText,
      points: null,
      autoPoints: null,
      challenged: false
    };

    this.broadcastActiveItemToManagers(connection);
    this.sendActiveItem(ws, connection);
    // A new answer clears its points.
    this.notifyResults(connection);
  }

  // Tells Results screens that team totals may have changed (#27).
  private notifyResults(connection: EventConnection) {
    this.server?.publish(`${connection.eventId}:results`, encode({ type: 'RESULTS_CHANGED' }));
  }

  private async handleSUBMIT_CHALLENGE(
    ws: ServerWebSocket<TeamWebsocketData>,
    connection: EventConnection,
    questionId: string,
    challenged: boolean
  ): Promise<MessageResult | void> {
    const activeItem = connection.activeItem;

    if (activeItem?.type !== 'question' || activeItem.phase !== 'answer' || activeItem.id !== questionId) {
      return refused('Challenges are only open while the question’s answer is shown.');
    }

    const answer = activeItem.answers[ws.data.id];

    if (!answer?.answerId) {
      return refused('Your team didn’t answer this question, so there’s nothing to challenge.');
    }

    await setAnswerChallenged(connection.eventId, answer.answerId, challenged);

    answer.challenged = challenged;

    await this.saveActiveItem(connection, activeItem);
    this.broadcastActiveItemToManagers(connection);
    this.sendActiveItem(ws, connection);
  }

  // Frees the team for another device (#44): the device that held it is told and disconnected.
  private async handleRELEASE_TEAM_DEVICE(connection: EventConnection, teamId: string): Promise<MessageResult | void> {
    if (!(await releaseTeamDevice(connection.eventId, teamId))) {
      return refused('That team isn’t in this event.');
    }

    const teamWs = connection.teams.get(teamId);

    if (teamWs) {
      teamWs.send(
        encode({
          type: 'CONNECTION_ERROR',
          code: 'RELEASED',
          message: 'The host released this device from the team. To join again, use your team’s code.'
        })
      );
      teamWs.data.released = true;
      teamWs.close();
    } else {
      // Already disconnected: it won't be back on that device, so it's offline now rather than reconnecting.
      const key = `${connection.eventId}:${teamId}`;

      if (this.teamOfflineTimers.has(key)) {
        clearTimeout(this.teamOfflineTimers.get(key));
        this.teamOfflineTimers.delete(key);

        const team = await getTeam(connection.eventId, teamId);

        if (team) {
          this.publishTeamConnection(connection.eventId, teamId, team.number, 'offline');
        }
      }
    }

    this.server?.publish(
      `${connection.eventId}:hosts`,
      encode({ type: 'TEAM_STATUS', teams: [{ id: teamId, hasDevice: false }] })
    );
  }

  // A new join code for the team (#44): the old code and link stop working; its device stays connected.
  private async handleRENEW_JOIN_CODE(connection: EventConnection, teamId: string): Promise<MessageResult | void> {
    const joinCode = await renewJoinCode(connection.eventId, teamId);

    if (!joinCode) {
      return refused('That team isn’t in this event.');
    }

    this.server?.publish(
      `${connection.eventId}:hosts`,
      encode({ type: 'TEAM_STATUS', teams: [{ id: teamId, joinCode }] })
    );
  }

  private async handleUPDATE_RUN_STATUS(connection: EventConnection, status: RunStatus): Promise<void> {
    await setRunStatus(connection.eventId, status);

    connection.run.status = status;

    // Starting over erased every answer: the open question's copy must match (#54), and the totals are 0.
    if (status === 'not_started') {
      connection.activeItem = await withAnswers(connection.eventId, connection.activeItem);
      this.notifyResults(connection);
    }

    const message = encode({ type: 'RUN_STATUS', status });

    this.broadcastToAll(connection, message);
    await this.pauseOrResumeTimer(connection, status);
  }

  private async handleUPDATE_GRACE_PERIOD(connection: EventConnection, gracePeriod: number): Promise<void> {
    await setGracePeriod(connection.eventId, gracePeriod);

    connection.run.gracePeriod = gracePeriod;

    const message = encode({ type: 'GRACE_PERIOD', gracePeriod });

    this.broadcastToAll(connection, message);

    // The running question's time-up moves with the grace period.
    if (connection.timeUpTimer) {
      this.scheduleTimeUp(connection);
    }
  }

  private async handleSET_ACTIVE_ITEM(connection: EventConnection, sentItem: ActiveItem | null): Promise<void> {
    const currentActiveItem = connection.activeItem;
    // The answers come from the answers table, not the host page's copy (#54).
    const nextActiveItem = await withAnswers(connection.eventId, sentItem);

    if (
      nextActiveItem?.type === 'question' &&
      nextActiveItem.phase === 'reading' &&
      currentActiveItem?.type === 'question' &&
      currentActiveItem.phase === 'answer'
    ) {
      await this.handleSET_QUESTION_LOCKED(connection, currentActiveItem.id, true);
    }

    // Opening a question for answers starts its timer.
    if (nextActiveItem?.type === 'question' && nextActiveItem.phase === 'prompt' && !nextActiveItem.locked) {
      this.startTimer(connection, nextActiveItem);
    }

    await this.saveActiveItem(connection, nextActiveItem);
    connection.activeItem = nextActiveItem;

    this.scheduleTimeUp(connection);
    this.broadcastActiveItemToAll(connection);
  }

  private async handleSET_QUESTION_LOCKED(
    connection: EventConnection,
    questionId: string,
    locked: boolean
  ): Promise<MessageResult | void> {
    const activeItem = connection.activeItem;

    if (!(await setQuestionLocked(connection.eventId, questionId, locked))) {
      return refused('That question isn’t in this event.');
    }

    const message = encode({
      type: 'QUESTION_LOCKED',
      questionId,
      locked
    });

    this.broadcastToManagers(connection, message);

    if (activeItem?.type === 'question' && activeItem.phase !== 'reading' && activeItem.id === questionId) {
      activeItem.locked = locked;

      await this.saveActiveItem(connection, activeItem);
      this.broadcastActiveItemToAll(connection);
    }
  }

  private async handleSTART_TIMER(connection: EventConnection): Promise<MessageResult | void> {
    const item = this.promptItem(connection);

    if (!item) {
      return refused('The timer only runs while a question is open for answers.');
    }

    this.startTimer(connection, item);
    await this.saveActiveItem(connection, item);
    this.scheduleTimeUp(connection);
    this.broadcastActiveItemToAll(connection);
  }

  // No time limit for the open question: teams can answer until the host moves on or locks it.
  private async handleREMOVE_TIMER(connection: EventConnection): Promise<MessageResult | void> {
    const item = this.promptItem(connection);

    if (!item) {
      return refused('The timer only runs while a question is open for answers.');
    }

    this.clearTimer(connection);
    item.endsAt = null;
    item.pausedMs = null;
    item.isTimeUp = false;
    await this.saveActiveItem(connection, item);
    this.broadcastActiveItemToAll(connection);
  }

  private async handleSET_QUESTION_GRADED(
    connection: EventConnection,
    questionId: string,
    graded: boolean
  ): Promise<MessageResult | void> {
    const activeItem = connection.activeItem;

    if (!(await setQuestionGraded(connection.eventId, questionId, graded))) {
      return refused('That question isn’t in this event.');
    }

    const message = encode({
      type: 'QUESTION_GRADED',
      questionId,
      graded
    });

    this.broadcastToManagers(connection, message);

    if (activeItem?.type === 'question' && activeItem.phase !== 'reading' && activeItem.id === questionId) {
      activeItem.graded = graded;
      await this.saveActiveItem(connection, activeItem);
      this.broadcastActiveItemToAll(connection);
    }
  }

  private async handleUPDATE_POINTS(
    connection: EventConnection,
    answerId: string,
    points: number | null
  ): Promise<MessageResult | void> {
    const answer = await setAnswerPoints(connection.eventId, answerId, points);

    if (!answer) {
      return refused('That answer isn’t in this event.');
    }

    this.notifyResults(connection);

    const message = encode({
      type: 'POINTS_UPDATED',
      questionId: answer.question_id,
      answerId,
      points
    });

    this.broadcastToManagers(connection, message);

    const activeItem = connection.activeItem;

    if (activeItem && activeItem.type === 'question' && activeItem.id === answer.question_id) {
      const activeAnswer =
        activeItem.type === 'question' && activeItem.phase !== 'reading' ? activeItem.answers[answer.team_id] : null;

      if (activeAnswer) {
        activeAnswer.points = points;

        await this.saveActiveItem(connection, activeItem);
        this.broadcastActiveItemToAll(connection);
      }
    }
  }
}
