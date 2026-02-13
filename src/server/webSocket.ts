import type { Session } from '@/server/types';
import {
  textBadRequest,
  textForbidden,
  textNotFound,
  textServerError,
  textUnauthorized
} from '@/server/utils/responses';
import type { ActiveItem } from '@/types';
import { sql, type ServerWebSocket } from 'bun';
import { pick } from 'lodash';

export type TeamWebsocketData = {
  role: 'team';
  eventId: string;
  id: string;
  name: string;
  number: number;
  languageId: string;
  languageCode: string;
  hash: string;
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
};

export type WebsocketData =
  | HostWebsocketData
  | PresenterWebsocketData
  | TeamWebsocketData
  | JudgeWebsocketData
  | ErrorWebsocketData;

export interface EventConnection {
  eventId: string;
  eventName: string;
  teams: Map<string, ServerWebSocket<TeamWebsocketData>>;
  run: Run;
  activeItem: ActiveItem | null;
  languages?: Record<string, { id: string; code: string; name: string }>;
  tickTimer?: NodeJS.Timeout;
}

export interface Run {
  status: 'not_started' | 'in_progress' | 'paused' | 'completed';
  gracePeriod: number;
}

export class WebSocketServer {
  private eventConnections: Map<string, EventConnection>;
  private server: Bun.Server<WebsocketData> | null = null;

  constructor() {
    this.eventConnections = new Map();
  }

  setServer(server: Bun.Server<WebsocketData>) {
    this.server = server;
  }

  createHandlers() {
    return {
      data: {} as WebsocketData,
      open: this.handleOpen,
      close: this.handleClose,
      message: this.handleMessage,
      idleTimeout: 10
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
    const eventId = url.searchParams.get('eventId');

    if (!role) {
      this.server?.upgrade(req, { data: { role: 'error', message: 'Missing role in URL' } });
      return;
    }

    if (role !== 'host' && role !== 'team' && role !== 'presenter' && role !== 'judge') {
      this.server?.upgrade(req, { data: { role: 'error', message: 'Invalid URL role' } });
      return;
    }

    if (!eventId) {
      this.server?.upgrade(req, { data: { role: 'error', message: 'Missing eventId in URL' } });
      return;
    }

    // Check if event exists
    const events: { id: string }[] = await sql`SELECT id FROM events WHERE id = ${eventId}`;

    if (events.length === 0) {
      this.server?.upgrade(req, { data: { role: 'error', message: 'Event not found' } });
      return;
    }

    // Initialize connection tracking if needed
    if (!this.eventConnections.has(eventId)) {
      await this.initializeEventConnection(eventId);

      if (!this.eventConnections.has(eventId)) {
        this.server?.upgrade(req, {
          data: { role: 'error', message: 'Could not initialize event connection' }
        });
        return;
      }
    }

    if (role === 'host') {
      if (!session) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Unauthorized' } });
        return;
      }

      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

      if (permissions.length === 0) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Host permission denied' } });
        return;
      }

      if (this.server?.upgrade(req, { data: { role: 'host', session, eventId } })) {
        return;
      }
    } else if (role === 'judge') {
      if (!session) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Unauthorized' } });
        return;
      }

      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('judge', 'admin', 'owner')
        `;

      if (permissions.length === 0) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Judge permission denied' } });
        return;
      }

      if (this.server?.upgrade(req, { data: { role: 'judge', session, eventId, wsId: Bun.randomUUIDv7() } })) {
        return;
      }
    } else if (role === 'presenter') {
      if (!session) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Unauthorized' } });
        return;
      }

      // Validate session and permissions for host
      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

      if (permissions.length === 0) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Presenter permission denied' } });
        return;
      }

      if (this.server?.upgrade(req, { data: { role: 'presenter', session, eventId } })) {
        return;
      }
    } else {
      const hash = url.searchParams.get('hash');

      if (!hash) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Missing hash in URL' } });
        return;
      }

      const teamId = url.searchParams.get('teamId');

      if (!teamId) {
        this.server?.upgrade(req, { data: { role: 'error', message: 'Missing teamId in URL' } });
        return;
      }

      const connection = this.eventConnections.get(eventId);
      const existingTeam = connection?.teams.get(teamId);
      const subscriberCount = this.server?.subscriberCount(`${eventId}:team:${teamId}`);

      if (existingTeam || (subscriberCount && subscriberCount > 0)) {
        if (existingTeam?.data.hash !== hash) {
          this.server?.upgrade(req, { data: { role: 'error', message: 'Team already connected' } });
          return;
        } else {
          existingTeam?.close();
          connection?.teams.delete(teamId);

          if (!this.eventConnections.has(eventId)) {
            await this.initializeEventConnection(eventId);
          }
        }
      }

      // Validate team exists for team role
      const teams: {
        id: string;
        name: string;
        number: number;
        languageId: string;
        languageCode: string;
      }[] = await sql`
          SELECT t.id, t.name, t.number, t.language_id, l.code as language_code
          FROM teams t
          LEFT JOIN languages l ON l.id = t.language_id
          WHERE t.id = ${teamId} AND t.event_id = ${eventId}
        `;

      const team = teams[0];

      if (!team) {
        this.cleanUpEventConnection(eventId);
        this.server?.upgrade(req, { data: { role: 'error', message: 'Team not found' } });
        return;
      }

      if (
        this.server?.upgrade(req, {
          data: {
            role: 'team',
            eventId,
            id: team.id,
            name: team.name,
            number: team.number,
            languageId: team.languageId,
            languageCode: team.languageCode,
            hash
          }
        })
      ) {
        return;
      }
    }

    console.error('WebSocket upgrade failed', req.url);
    this.cleanUpEventConnection(eventId);
    return textServerError('WebSocket upgrade failed');
  }

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { role } = ws.data;

    if (role === 'error') {
      ws.send(JSON.stringify({ type: 'CONNECTION_ERROR', message: ws.data.message }));
      return;
    }

    const { eventId } = ws.data as Exclude<WebsocketData, ErrorWebsocketData>;

    const connection = this.eventConnections.get(eventId)!;

    if (!connection) {
      console.error('No event connection found for eventId', eventId, ws.data);
      return;
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
      const teams: {
        language_id: string;
        code: string;
        name: string;
        number: number;
      }[] = await sql`
          SELECT t.language_id, l.code, t.name, t.number
          FROM teams t
          LEFT JOIN languages l ON l.id = t.language_id
          WHERE t.id = ${id}
        `;

      if (teams.length > 0) {
        connection.teams.set(id, ws);

        const team = teams[0]!;

        ws.data.languageId = team.language_id;
        ws.data.languageCode = team.code;

        ws.send(JSON.stringify({ type: 'EVENT_INFO', event: { id: eventId, name: connection.eventName } }));

        ws.send(
          JSON.stringify({
            type: 'TEAM_INFO',
            team: { id, name: team.name, languageId: ws.data.languageId, languageCode: team.code }
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
            teams: [
              {
                id,
                status: 'connected',
                name: team.name,
                number: team.number,
                languageCode: team.code
              }
            ]
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

    const { eventId } = ws.data;

    if (!eventId) {
      return;
    }

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    if (role === 'team') {
      const { id, number, languageCode } = ws.data;
      const team = connection.teams.get(id);

      if (!team || team !== ws) {
        console.log(`Team ${number} WebSocket mismatch on close`, eventId, id);
      }

      connection.teams.delete(id);

      ws.unsubscribe(`${eventId}:${languageCode}`);
      ws.unsubscribe(`${eventId}:team:${id}`);

      const subscriberCount = this.server?.subscriberCount(`${eventId}:team:${id}`);

      console.log(`Subscriber count for team ${number}`, `${eventId}:team:${id}`, ':', subscriberCount);

      if (!subscriberCount || subscriberCount === 0) {
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
  private handleMessage = async (ws: ServerWebSocket<WebsocketData>, message: string | Buffer) => {
    const { role } = ws.data;

    if (role === 'error') {
      return;
    }

    const connection = this.eventConnections.get(ws.data.eventId);

    if (!connection) {
      return;
    }

    // Handle team messages
    if (this.isTeamWebSocket(ws)) {
      const msg = JSON.parse(message as string) as
        | { type: 'SUBMIT_ANSWER'; answer: string; __ACK__: string }
        | { type: 'SUBMIT_CHALLENGE'; questionId: string; challenged: boolean; __ACK__: string };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));

      switch (msg.type) {
        case 'SUBMIT_ANSWER':
          await this.handleSUBMIT_ANSWER(ws, connection, msg.answer);
          break;
        case 'SUBMIT_CHALLENGE':
          await this.handleSUBMIT_CHALLENGE(ws, connection, msg.questionId, msg.challenged);
          break;
      }
    }

    // Handle host messages
    if (this.isHostWebSocket(ws)) {
      const msg = JSON.parse(message as string) as
        | {
            type: 'UPDATE_RUN_STATUS';
            status: 'not_started' | 'in_progress' | 'paused' | 'completed';
            __ACK__: string;
          }
        | { type: 'UPDATE_GRACE_PERIOD'; gracePeriod: number; __ACK__: string }
        | { type: 'SET_ACTIVE_ITEM'; activeItem: ActiveItem | null; __ACK__: string }
        | { type: 'SET_QUESTION_LOCKED'; questionId: string; locked: boolean; __ACK__: string }
        | { type: 'START_TIMER'; __ACK__: string }
        | { type: 'REMOVE_TIMER'; __ACK__: string };

      switch (msg.type) {
        case 'UPDATE_RUN_STATUS':
          await this.handleUPDATE_RUN_STATUS(connection, msg.status);
          break;
        case 'UPDATE_GRACE_PERIOD':
          await this.handleUPDATE_GRACE_PERIOD(connection, msg.gracePeriod);
          break;
        case 'SET_ACTIVE_ITEM':
          await this.handleSET_ACTIVE_ITEM(connection, msg.activeItem);
          break;
        case 'SET_QUESTION_LOCKED':
          await this.handleSET_QUESTION_LOCKED(connection, msg.questionId, msg.locked);
          break;
        case 'START_TIMER':
          this.handleSTART_TIMER(connection);
          break;
        case 'REMOVE_TIMER':
          this.handleREMOVE_TIMER(connection);
          break;
      }

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));
    }

    if (this.isPresenterWebSocket(ws)) {
      const msg = JSON.parse(message as string) as { type: string; __ACK__: string };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));
    }

    if (this.isJudgeWebSocket(ws)) {
      const msg = JSON.parse(message as string) as
        | {
            type: 'UPDATE_POINTS';
            answerId: string;
            points: number | null;
            __ACK__: string;
          }
        | { type: 'SET_QUESTION_GRADED'; questionId: string; graded: boolean; __ACK__: string };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));

      switch (msg.type) {
        case 'UPDATE_POINTS':
          await this.handleUPDATE_POINTS(connection, msg.answerId, msg.points);
          break;
        case 'SET_QUESTION_GRADED':
          await this.handleSET_QUESTION_GRADED(connection, msg.questionId, msg.graded);
          break;
      }
    }
  };

  private async cleanUpEventConnection(eventId: string): Promise<void> {
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
    const [run]: {
      event_id: string;
      name: string;
      status: string;
      grace_period: number;
      active_item: ActiveItem | null;
    }[] = await sql`
      SELECT event_id, name, status, grace_period, active_item
      FROM runs
      JOIN events ON runs.event_id = events.id
      WHERE event_id = ${eventId}
    `;

    if (run) {
      // Fetch languages for the event
      const languages: { id: string; code: string; name: string }[] = await sql`
        SELECT id, code, name
        FROM languages
        WHERE event_id = ${eventId}
      `;

      if (languages.length > 0) {
        console.log('Initializing event connection for eventId', eventId);

        this.eventConnections.set(eventId, {
          eventId,
          eventName: run.name,
          teams: new Map(),
          run: {
            status: run.status as 'not_started' | 'in_progress' | 'paused' | 'completed',
            gracePeriod: run.grace_period
          },
          activeItem: run.active_item,
          languages: Object.fromEntries(languages.map((lang) => [lang.code, lang]))
        });
      }
    }
  }

  sendActiveItem(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    const activeItem = connection.activeItem;

    if (ws.data.role === 'team' && activeItem && 'answers' in activeItem) {
      const team = ws.data;
      const answers = pick(activeItem.answers, team.id);

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
    const teams: { id: string; number: number }[] =
      await sql`SELECT id, number FROM teams WHERE event_id = ${connection.eventId}`;

    const teamStatuses = teams.map((team) => {
      const teamWs = connection.teams.get(team.id);
      const subscriberCount = this.server?.subscriberCount(`${connection.eventId}:team:${team.id}`);
      const teamStatus = teamWs || (subscriberCount && subscriberCount > 0) ? 'connected' : 'offline';

      console.log('    Team status for', team.id, ':', teamStatus, subscriberCount);

      return {
        id: team.id,
        number: team.number,
        status: teamStatus
      };
    });

    ws.send(JSON.stringify({ type: 'TEAM_STATUS', teams: teamStatuses }));
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
    await sql`UPDATE runs SET active_item = ${activeItem}::jsonb WHERE event_id = ${connection.eventId}`;
  }

  private clearTickTimer(connection: EventConnection): void {
    if (connection.tickTimer) {
      clearTimeout(connection.tickTimer);
      connection.tickTimer = undefined;
    }
  }

  private scheduleTick(connection: EventConnection): void {
    this.clearTickTimer(connection);

    connection.tickTimer = setTimeout(() => this.tick(connection), 1000);
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
  ): Promise<void> {
    if (ws.data.role !== 'team') {
      return;
    }

    const { id, languageId } = ws.data;

    // Validate active question
    if (!connection.activeItem || connection.activeItem.type !== 'question') {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'NO_ACTIVE_QUESTION',
          message: 'No active question'
        })
      );

      return;
    }

    // Validate question is in prompt phase
    if (connection.activeItem?.phase !== 'prompt') {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'INVALID_PHASE',
          message: 'Question is not open for answers'
        })
      );

      return;
    }

    // Validate deadline if timer enabled
    if (connection.activeItem.isTimeUp) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'TIME_EXCEEDED',
          message: 'Answer submitted after time limit'
        })
      );

      return;
    }

    if (connection.activeItem.locked) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'QUESTION_LOCKED',
          message: 'Question is locked for answers'
        })
      );

      return;
    }

    // Get translation ID
    const translations: { id: string; language_code: string }[] = await sql`
        SELECT tr.id, l.code as language_code
        FROM translations tr
        JOIN languages l ON tr.language_id = l.id
        WHERE tr.question_id = ${connection.activeItem.id}
          AND tr.language_id = ${languageId}
      `;

    if (translations.length === 0) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'TRANSLATION_NOT_FOUND',
          message: 'Translation not found'
        })
      );

      return;
    }

    const translationId = translations[0]!.id;
    const languageCode = translations[0]!.language_code;
    const teamNumber = ws.data.number;
    const answerId = Bun.randomUUIDv7();

    // Upsert answer
    const result: { id: string }[] = await sql`
        INSERT INTO answers (id, answer, question_id, team_id, translation_id, created_at, updated_at)
        VALUES (${answerId}, ${answerText}, ${connection.activeItem.id}, ${id}, ${translationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (question_id, team_id)
        DO UPDATE SET answer = EXCLUDED.answer, points_awarded = NULL, auto_points_awarded = NULL, challenged = false, updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

    const finalAnswerId = result[0]!.id;
    const activeItem = connection.activeItem;

    activeItem.answers[id] = {
      answerId: finalAnswerId,
      teamId: id,
      teamNumber,
      languageCode,
      answerText: String(answerText),
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
  ): Promise<void> {
    const activeItem = connection.activeItem;

    if (activeItem?.type === 'question' && activeItem.phase === 'answer' && activeItem.id === questionId) {
      const answer = activeItem.answers[ws.data.id];

      if (answer?.answerId) {
        await sql`UPDATE answers SET challenged = ${challenged} WHERE id = ${answer.answerId}`;

        answer.challenged = challenged;

        this.saveActiveItem(connection, activeItem);
        this.broadcastActiveItemToManagers(connection);
        this.sendActiveItem(ws, connection);
      }
    }
  }

  private async handleUPDATE_RUN_STATUS(
    connection: EventConnection,
    status: 'not_started' | 'in_progress' | 'paused' | 'completed'
  ): Promise<void> {
    connection.run.status = status;

    if (status === 'not_started') {
      await sql`DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE event_id = ${connection.eventId})`;
      await sql`UPDATE questions SET locked = false, graded = false WHERE event_id = ${connection.eventId}`;
    }

    await sql`
        UPDATE runs
        SET status = ${status}
        WHERE event_id = ${connection.eventId}
      `;

    const message = JSON.stringify({ type: 'RUN_STATUS', status });

    this.broadcastToAll(connection, message);
  }

  private async handleUPDATE_GRACE_PERIOD(connection: EventConnection, gracePeriod: number): Promise<void> {
    connection.run.gracePeriod = gracePeriod;

    await sql`
        UPDATE runs
        SET grace_period = ${gracePeriod}
        WHERE event_id = ${connection.eventId}
      `;

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
      this.tick(connection);
    } else {
      this.broadcastActiveItemToAll(connection);
    }
  }

  private async handleSET_QUESTION_LOCKED(
    connection: EventConnection,
    questionId: string,
    locked: boolean
  ): Promise<void> {
    const activeItem = connection.activeItem;

    await sql`UPDATE questions SET locked = ${locked} WHERE id = ${questionId}`;

    const message = JSON.stringify({
      type: 'QUESTION_LOCKED',
      questionId,
      locked
    });

    this.broadcastToManagers(connection, message);

    if (activeItem?.type === 'question' && activeItem.phase !== 'reading' && activeItem.id === questionId) {
      activeItem.locked = locked;

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
      this.tick(connection);
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
  ): Promise<void> {
    const activeItem = connection.activeItem;

    await sql`UPDATE questions SET graded = ${graded} WHERE id = ${questionId}`;

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
  ): Promise<void> {
    const result: { question_id: string; team_id: string }[] = await sql`
      UPDATE answers
      SET points_awarded = ${points}
      WHERE id = ${answerId}
      RETURNING question_id, team_id
    `;

    const answer = result[0];

    if (!answer) {
      return;
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
