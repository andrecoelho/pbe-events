import type { Session } from '@/server/types';
import { textServerError } from '@/server/utils/responses';
import type { ActiveItem } from '@/types';
import { saveAnswer, setAnswerChallenged, setAnswerPoints } from '@/server/services/answers';
import { eventExists } from '@/server/services/events';
import { getLanguagesByCode, type Language } from '@/server/services/languages';
import { ALL_ROLES, getEventForRoles, MANAGER_ROLES } from '@/server/services/permissions';
import { getTranslation, setQuestionGraded, setQuestionLocked } from '@/server/services/questions';
import { getRun, saveActiveItem, setGracePeriod, setRunStatus, type RunStatus } from '@/server/services/runs';
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
import { SESSION_ENDED_CLOSE_CODE } from '@/types';
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

export type ErrorWebsocketData = {
  role: 'error';
  message: string;
  // NOT_JOINED: a team socket from a device that hasn't joined a team (or was released).
  code?: string;
};

type SignedInWebsocketData = HostWebsocketData | JudgeWebsocketData | PresenterWebsocketData;

// How often signed-in sockets are checked for sessions that expired or were deleted.
const SESSION_CHECK_MS = 60_000;

export type WebsocketData =
  | HostWebsocketData
  | PresenterWebsocketData
  | TeamWebsocketData
  | JudgeWebsocketData
  | ErrorWebsocketData;

// What a message's ACK carries: whether it worked, and if not, why (shown to the person).
export type MessageResult = { ok: true } | { ok: false; error: string };

const refused = (error: string): MessageResult => ({ ok: false, error });

export interface EventConnection {
  eventId: string;
  // The event's messages, handled one at a time (see handleMessage).
  queue: Promise<void>;
  eventName: string;
  teams: Map<string, ServerWebSocket<TeamWebsocketData>>;
  run: Run;
  activeItem: ActiveItem | null;
  languages?: Record<string, Language>;
  tickTimer?: NodeJS.Timeout;
}

export interface Run {
  status: RunStatus;
  gracePeriod: number;
}

export class WebSocketServer {
  private eventConnections: Map<string, EventConnection>;
  private server: Bun.Server<WebsocketData> | null = null;
  // Host, judge and presenter sockets by session id, so they can be closed when the session ends.
  private sessionSockets = new Map<string, Set<ServerWebSocket<SignedInWebsocketData>>>();

  constructor() {
    this.eventConnections = new Map();
  }

  setServer(server: Bun.Server<WebsocketData>) {
    this.server = server;

    onSessionEnded(this.closeSession);
    setInterval(this.closeEndedSessions, SESSION_CHECK_MS).unref();
  }

  private isSignedInWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<SignedInWebsocketData> {
    return ws.data.role === 'host' || ws.data.role === 'judge' || ws.data.role === 'presenter';
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
    const refuse = (message: string, code?: string) => {
      this.server?.upgrade(req, { data: { role: 'error', message, code } });
      return undefined;
    };

    if (!role) {
      return refuse('Missing role in URL');
    }

    if (role !== 'host' && role !== 'team' && role !== 'presenter' && role !== 'judge') {
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

    // Initialize connection tracking if needed
    if (!this.eventConnections.has(eventId)) {
      await this.initializeEventConnection(eventId);

      if (!this.eventConnections.has(eventId)) {
        return refuse('Could not initialize event connection');
      }
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
    } else if (team) {
      // Only the device holding the token gets here, so an open socket for the team is this device's own
      // (a reload or a dropped connection): the new one replaces it.
      this.eventConnections.get(eventId)?.teams.get(team.id)?.close();

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

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { role } = ws.data;

    if (role === 'error') {
      ws.send(JSON.stringify({ type: 'CONNECTION_ERROR', message: ws.data.message, code: ws.data.code }));
      return;
    }

    const { eventId } = ws.data as Exclude<WebsocketData, ErrorWebsocketData>;

    // A socket this one replaced (the same team device reconnecting) may have cleaned the connection up.
    if (!this.eventConnections.has(eventId)) {
      await this.initializeEventConnection(eventId);
    }

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      console.error('No event connection found for eventId', eventId, ws.data);
      ws.close();
      return;
    }

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
    } else if (this.isTeamWebSocket(ws)) {
      const { id } = ws.data;

      // Get team details including language
      const team = await getTeam(eventId, id);

      if (team) {
        connection.teams.set(id, ws);

        ws.data.languageId = team.language_id;
        ws.data.languageCode = team.language_code ?? '';

        ws.send(JSON.stringify({ type: 'EVENT_INFO', event: { id: eventId, name: connection.eventName } }));

        ws.send(
          JSON.stringify({
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

        // Send TEAM_CONNECTED to host
        this.server?.publish(
          `${eventId}:hosts`,
          JSON.stringify({
            type: 'TEAM_STATUS',
            teams: [this.teamStatus(team, 'connected')]
          })
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

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    if (role === 'team') {
      const { id, number } = ws.data;

      // A socket the same device replaced (a reload) closes after its replacement took over: leave that alone.
      if (connection.teams.get(id) === ws) {
        connection.teams.delete(id);

        this.server?.publish(
          `${eventId}:hosts`,
          JSON.stringify({ type: 'TEAM_STATUS', teams: [{ id, number, status: 'offline' }] })
        );

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
          return await this.handleSUBMIT_ANSWER(ws, connection, msg.answer);
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
      ws.send(JSON.stringify({ type: 'ACK', id: ackId, ...result }));
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
    ws.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_MESSAGE', message: result.error }));
    this.sendAck(ws, result.ack, refused(result.error));

    return null;
  }

  private cleanUpEventConnection(eventId: string): void {
    const connection = this.eventConnections.get(eventId);
    const hostCount = this.server?.subscriberCount(`${eventId}:hosts`);
    const presenterCount = this.server?.subscriberCount(`${eventId}:presenters`);
    const judgeCount = this.server?.subscriberCount(`${eventId}:judges`);
    const teamCount = this.server?.subscriberCount(`${eventId}:teams`);

    if (connection && hostCount === 0 && presenterCount === 0 && judgeCount === 0 && teamCount === 0) {
      console.log('Cleaning up event connection:', eventId);
      this.clearTickTimer(connection);
      this.eventConnections.delete(eventId);
    }
  }

  private async initializeEventConnection(eventId: string): Promise<void> {
    const run = await getRun(eventId);

    if (run) {
      const languages = await getLanguagesByCode(eventId);

      if (Object.keys(languages).length > 0) {
        console.log('Initializing event connection for eventId', eventId);

        this.eventConnections.set(eventId, {
          eventId,
          queue: Promise.resolve(),
          eventName: run.event_name,
          teams: new Map(),
          run: {
            status: run.status,
            gracePeriod: run.grace_period
          },
          activeItem: run.active_item,
          languages
        });
      }
    }
  }

  sendActiveItem(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    const activeItem = connection.activeItem;

    if (ws.data.role === 'team' && activeItem && 'answers' in activeItem) {
      const team = ws.data;
      const answers = team.id in activeItem.answers ? { [team.id]: activeItem.answers[team.id] } : {};

      ws.send(
        JSON.stringify({
          type: 'ACTIVE_ITEM',
          activeItem: { ...activeItem, answers }
        })
      );
    } else {
      ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem }));
    }
  }

  sendRunStatus(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(JSON.stringify({ type: 'RUN_STATUS', status: connection.run.status }));
  }

  sendLanguages(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(JSON.stringify({ type: 'LANGUAGES', languages: connection.languages }));
  }

  async sendTeamStatuses(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): Promise<void> {
    const teams = await listTeams(connection.eventId);

    const teamStatuses = teams.map((team) =>
      this.teamStatus(team, connection.teams.has(team.id) ? 'connected' : 'offline')
    );

    ws.send(JSON.stringify({ type: 'TEAM_STATUS', teams: teamStatuses }));
  }

  // A team's entry in TEAM_STATUS (sent to hosts only: it has the join code).
  private teamStatus(team: Team, status: 'connected' | 'offline') {
    return {
      id: team.id,
      number: team.number,
      name: team.name,
      languageCode: team.language_code,
      joinCode: team.join_code,
      hasDevice: team.has_device,
      status
    };
  }

  sendGracePeriod(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(JSON.stringify({ type: 'GRACE_PERIOD', gracePeriod: connection.run.gracePeriod }));
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
    const message = JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
  }

  broadcastActiveItemToAll(connection: EventConnection) {
    const activeItem = connection.activeItem;
    const message = JSON.stringify({ type: 'ACTIVE_ITEM', activeItem });

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

  private clearTickTimer(connection: EventConnection): void {
    if (connection.tickTimer) {
      clearTimeout(connection.tickTimer);
      connection.tickTimer = undefined;
    }
  }

  private scheduleTick(connection: EventConnection): void {
    this.clearTickTimer(connection);

    // Through the event's queue, so a tick can't interleave with a message changing the active item.
    connection.tickTimer = setTimeout(() => {
      connection.queue = connection.queue.then(() =>
        this.tick(connection).catch((error) => console.error('Timer tick failed for event', connection.eventId, error))
      );
    }, 1000);
  }

  private async tick(connection: EventConnection): Promise<void> {
    // In case we start a timer when there is already one running
    // For example, if the host clicks "Start Timer" multiple times quickly or comes
    // back from the answer phase to the prompt phase
    this.clearTickTimer(connection);

    const activeItem = connection.activeItem;

    if (activeItem?.type === 'question' && activeItem.phase === 'prompt' && activeItem.startTime !== null) {
      const now = Date.now();
      const startTime = new Date(activeItem.startTime).getTime();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remainingSeconds = Math.max(activeItem.seconds - elapsedSeconds, 0);
      const isTimeUp = elapsedSeconds >= activeItem.seconds + connection.run.gracePeriod;

      activeItem.remainingSeconds = remainingSeconds;
      activeItem.isTimeUp = isTimeUp;

      await this.saveActiveItem(connection, activeItem);
      this.broadcastActiveItemToAll(connection);

      if (activeItem.isTimeUp) {
        return;
      }

      this.scheduleTick(connection);
    }
  }

  private async handleSUBMIT_ANSWER(
    ws: ServerWebSocket<TeamWebsocketData>,
    connection: EventConnection,
    answerText: string
  ): Promise<MessageResult | void> {
    const { id, languageId } = ws.data;
    const activeItem = connection.activeItem;

    if (activeItem?.type !== 'question' || activeItem.phase !== 'prompt') {
      return refused('The question isn’t open for answers right now.');
    }

    if (activeItem.isTimeUp) {
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
        JSON.stringify({
          type: 'CONNECTION_ERROR',
          code: 'RELEASED',
          message: 'The host released this device from the team. To join again, use your team’s code.'
        })
      );
      teamWs.close();
    }

    this.server?.publish(
      `${connection.eventId}:hosts`,
      JSON.stringify({ type: 'TEAM_STATUS', teams: [{ id: teamId, hasDevice: false }] })
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
      JSON.stringify({ type: 'TEAM_STATUS', teams: [{ id: teamId, joinCode }] })
    );
  }

  private async handleUPDATE_RUN_STATUS(connection: EventConnection, status: RunStatus): Promise<void> {
    await setRunStatus(connection.eventId, status);

    connection.run.status = status;

    const message = JSON.stringify({ type: 'RUN_STATUS', status });

    this.broadcastToAll(connection, message);
  }

  private async handleUPDATE_GRACE_PERIOD(connection: EventConnection, gracePeriod: number): Promise<void> {
    await setGracePeriod(connection.eventId, gracePeriod);

    connection.run.gracePeriod = gracePeriod;

    const message = JSON.stringify({ type: 'GRACE_PERIOD', gracePeriod });

    this.broadcastToAll(connection, message);
  }

  private async handleSET_ACTIVE_ITEM(connection: EventConnection, nextActiveItem: ActiveItem | null): Promise<void> {
    const currentActiveItem = connection.activeItem;

    if (
      nextActiveItem?.type === 'question' &&
      nextActiveItem.phase === 'reading' &&
      currentActiveItem?.type === 'question' &&
      currentActiveItem.phase === 'answer'
    ) {
      await this.handleSET_QUESTION_LOCKED(connection, currentActiveItem.id, true);
    }

    if (nextActiveItem?.type === 'question' && nextActiveItem.phase === 'prompt' && !nextActiveItem.locked) {
      nextActiveItem.startTime = Date.now();
      nextActiveItem.remainingSeconds = nextActiveItem.seconds;
      nextActiveItem.isTimeUp = false;
    }

    await this.saveActiveItem(connection, nextActiveItem);
    connection.activeItem = nextActiveItem;

    if (nextActiveItem?.type === 'question' && nextActiveItem.phase === 'prompt' && !nextActiveItem.locked) {
      await this.tick(connection);
    } else {
      this.broadcastActiveItemToAll(connection);
    }
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

    const message = JSON.stringify({
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

  private async handleSTART_TIMER(connection: EventConnection): Promise<void> {
    const activeItem = connection.activeItem;

    if (activeItem?.type === 'question' && activeItem.phase === 'prompt') {
      activeItem.startTime = Date.now();
      activeItem.remainingSeconds = activeItem.seconds;
      activeItem.isTimeUp = false;
      await this.saveActiveItem(connection, activeItem);
      await this.tick(connection);
    }
  }

  private async handleREMOVE_TIMER(connection: EventConnection): Promise<void> {
    this.clearTickTimer(connection);

    const activeItem = connection.activeItem;

    if (activeItem?.type === 'question' && activeItem.phase === 'prompt') {
      activeItem.startTime = null;
      activeItem.remainingSeconds = activeItem.seconds;
      activeItem.isTimeUp = false;
      await this.saveActiveItem(connection, activeItem);
      this.broadcastActiveItemToAll(connection);
    }
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

    const message = JSON.stringify({
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

    const message = JSON.stringify({
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
