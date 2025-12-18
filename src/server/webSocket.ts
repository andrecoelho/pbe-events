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

export type TeamWebsocketData = {
  role: 'team';
  eventId: string;
  id: string;
  name: string;
  number: number;
  languageId: string | null;
  languageCode: string | null;
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

export type WebsocketData = HostWebsocketData | PresenterWebsocketData | TeamWebsocketData | JudgeWebsocketData;

export interface EventConnection {
  eventId: string;
  eventName: string;
  hosts: ServerWebSocket<HostWebsocketData>[];
  presenters: ServerWebSocket<PresenterWebsocketData>[];
  teams: Map<string, ServerWebSocket<TeamWebsocketData>>;
  judges: Map<string, ServerWebSocket<JudgeWebsocketData>>;
  run: Run;
  activeItem: ActiveItem | null;
  languages?: Record<string, { id: string; code: string; name: string }>;
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
      message: this.handleMessage
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
    const teamId = url.searchParams.get('teamId');

    if (!eventId || !role) {
      console.error('Missing eventId or role in WebSocket upgrade request', req.url);
      return textBadRequest('Missing eventId or role');
    }

    if (role !== 'host' && role !== 'team' && role !== 'presenter' && role !== 'judge') {
      console.error('Invalid role in WebSocket upgrade request', req.url);
      return textBadRequest('Invalid role');
    }

    // Check if event exists
    const events: { id: string }[] = await sql`SELECT id FROM events WHERE id = ${eventId}`;

    if (events.length === 0) {
      console.error('Event not found for WebSocket upgrade request', req.url);
      return textNotFound('Event not found');
    }

    if (role === 'host') {
      if (!session) {
        console.error('No session found for host connection', req.url);
        return;
      }

      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

      if (permissions.length === 0) {
        console.error('Host permission denied for event', req.url);
        return textForbidden();
      }

      if (this.server?.upgrade(req, { data: { role: 'host', session, eventId } })) {
        return;
      }
    } else if (role === 'judge') {
      if (!session) {
        console.error('No session found for judge connection', req.url);
        return textUnauthorized();
      }

      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('judge', 'admin', 'owner')
        `;

      if (permissions.length === 0) {
        console.error('Judge permission denied for event', req.url);
        return textForbidden();
      }

      if (this.server?.upgrade(req, { data: { role: 'judge', session, eventId, wsId: Bun.randomUUIDv7() } })) {
        return;
      }
    } else if (role === 'presenter') {
      if (!session) {
        console.error('No session found for presenter connection', req.url);
        return textUnauthorized();
      }

      // Validate session and permissions for host
      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

      if (permissions.length === 0) {
        console.error('Presenter permission denied for event', req.url);
        return textForbidden();
      }

      if (this.server?.upgrade(req, { data: { role: 'presenter', session, eventId } })) {
        return;
      }
    } else {
      if (!teamId) {
        console.error('Missing teamId for team connection', req.url);
        return textBadRequest('Missing teamId');
      }

      if (this.eventConnections.has(eventId) && this.eventConnections.get(eventId)!.teams.has(teamId)) {
        console.error('Team already connected for event', req.url);
        return textBadRequest('Team already connected');
      }

      // Validate team exists for team role
      const teams: { id: string; name: string; number: number; languageId: string | null }[] =
        await sql`SELECT id, name, number, language_id FROM teams WHERE id = ${teamId} AND event_id = ${eventId}`;

      if (teams.length === 0) {
        console.error('Team not found for WebSocket upgrade request', req.url);
        return textNotFound('Team not found');
      }

      if (
        this.server?.upgrade(req, {
          data: {
            role: 'team',
            eventId,
            id: teams[0]!.id,
            name: teams[0]!.name,
            number: teams[0]!.number,
            languageId: teams[0]!.languageId,
            languageCode: null
          }
        })
      ) {
        return;
      }
    }

    console.error('WebSocket upgrade failed', req.url);
    return textServerError('WebSocket upgrade failed');
  }

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { eventId } = ws.data;

    // Initialize connection tracking if needed
    if (eventId && !this.eventConnections.has(eventId)) {
      await this.initializeEventConnection(eventId);
    }

    if (!this.eventConnections.has(eventId)) {
      ws.close();
      return;
    }

    const connection = this.eventConnections.get(eventId)!;

    if (this.isHostWebSocket(ws)) {
      connection.hosts.push(ws);
      ws.subscribe(`${eventId}:hosts`);
      this.sendTeamStatuses(ws, connection);
      this.sendActiveItem(ws, connection);
    } else if (this.isJudgeWebSocket(ws)) {
      connection.judges.set(ws.data.wsId, ws);
      ws.subscribe(`${eventId}:judges`);
      this.sendLanguages(ws, connection);
      this.sendRunStatus(ws, connection);
      this.sendActiveItem(ws, connection);
    } else if (this.isPresenterWebSocket(ws)) {
      connection.presenters.push(ws);
      this.sendLanguages(ws, connection);
      this.sendRunStatus(ws, connection);
      this.sendActiveItem(ws, connection);
      ws.subscribe(`${eventId}:presenters`);
    } else if (this.isTeamWebSocket(ws)) {
      const { id } = ws.data;

      // Close existing connection if team reconnecting
      if (connection.teams.has(id)) {
        connection.teams.get(id)?.close();
        connection.teams.delete(id);
      }

      connection.teams.set(id, ws);

      // Get team details including language
      const teams: {
        language_id: string | null;
        code: string | null;
        name: string;
        number: number;
      }[] = await sql`
          SELECT t.language_id, l.code, t.name, t.number
          FROM teams t
          LEFT JOIN languages l ON l.id = t.language_id
          WHERE t.id = ${id}
        `;

      if (teams.length > 0) {
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

        this.sendLanguages(ws, connection);

        // Subscribe to language channel if language selected
        if (team.code) {
          ws.subscribe(`${eventId}:${team.code}`);
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
                  status: 'ready',
                  name: team.name,
                  number: team.number,
                  languageCode: team.code
                }
              ]
            })
          );
        } else {
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
                  languageCode: null
                }
              ]
            })
          );
        }

        // Send existing answer if active question and team has language
        if (connection.activeItem && connection.activeItem.type === 'question' && ws.data.languageId) {
          await this.sendExistingAnswerToTeam(ws, connection);
        }
      }
    }
  };

  // Called when a WebSocket connection is closed
  private handleClose = async (ws: ServerWebSocket<WebsocketData>) => {
    const { eventId, role } = ws.data;

    if (!eventId) {
      return;
    }

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    if (role === 'host') {
      connection.hosts = connection.hosts.filter((hostWs) => hostWs !== ws);
      console.log('Host disconnected for event', eventId);
    } else if (role === 'judge') {
      connection.judges.delete(ws.data.session.user_id);
    } else if (role === 'presenter') {
      connection.presenters = connection.presenters.filter((presenterWs) => presenterWs !== ws);
    } else {
      const { id, languageCode } = ws.data;
      const team = connection.teams.get(id)?.data;

      connection.teams.delete(id);

      // Unsubscribe from language channel
      if (languageCode) {
        ws.unsubscribe(`${eventId}:${languageCode}`);
      }

      if (team) {
        // Notify host
        this.server?.publish(
          `${eventId}:hosts`,
          JSON.stringify({
            type: 'TEAM_STATUS',
            teams: [
              {
                id,
                status: 'offline',
                name: team.name,
                number: team.number,
                languageCode
              }
            ]
          })
        );
      }
    }

    // Clean up empty connections
    if (
      connection.hosts.length === 0 &&
      connection.presenters.length === 0 &&
      connection.judges.size === 0 &&
      connection.teams.size === 0
    ) {
      this.eventConnections.delete(eventId);
    }
  };

  // Called when a WebSocket message is received
  private handleMessage = async (ws: ServerWebSocket<WebsocketData>, message: string | Buffer) => {
    const { eventId, role } = ws.data;

    if (!eventId) {
      return;
    }

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    // Handle team messages
    if (role === 'team') {
      const msg = JSON.parse(message as string) as { type: 'SUBMIT_ANSWER'; answer: string; __ACK__: string };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));

      switch (msg.type) {
        case 'SUBMIT_ANSWER':
          await this.handleSUBMIT_ANSWER(ws, connection, msg.answer);
          break;
      }
    }

    // Handle host messages
    if (role === 'host') {
      const msg = JSON.parse(message as string) as
        | {
            type: 'UPDATE_RUN_STATUS';
            status: 'not_started' | 'in_progress' | 'paused' | 'completed';
            __ACK__: string;
          }
        | { type: 'UPDATE_GRACE_PERIOD'; gracePeriod: number; __ACK__: string }
        | { type: 'SET_ACTIVE_ITEM'; activeItem: ActiveItem; __ACK__: string };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));

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
      }
    }

    if (role === 'presenter') {
      const msg = JSON.parse(message as string) as { type: string; __ACK__: string };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));
    }

    if (role === 'judge') {
      const msg = JSON.parse(message as string) as {
        type: 'UPDATE_POINTS';
        answerId: string;
        points: number | null;
        __ACK__: string;
      };

      ws.send(JSON.stringify({ type: 'ACK', id: msg['__ACK__'] }));

      switch (msg.type) {
        case 'UPDATE_POINTS':
          await this.handleUPDATE_POINTS(connection, msg.answerId, msg.points);
          break;
      }
    }
  };

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
        this.eventConnections.set(eventId, {
          eventId,
          eventName: run.name,
          hosts: [],
          presenters: [],
          judges: new Map(),
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
    ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem }));
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
      const teamStatus = !teamWs ? 'offline' : teamWs.data.languageCode ? 'ready' : 'connected';

      return {
        id: team.id,
        number: team.number,
        status: teamStatus,
        languageCode: teamWs?.data.languageCode || null
      };
    });

    ws.send(JSON.stringify({ type: 'TEAM_STATUS', teams: teamStatuses }));
  }

  sendGracePeriod(ws: ServerWebSocket<WebsocketData>, connection: EventConnection): void {
    ws.send(JSON.stringify({ type: 'GRACE_PERIOD', gracePeriod: connection.run.gracePeriod }));
  }

  private async sendExistingAnswerToTeam(
    ws: ServerWebSocket<WebsocketData>,
    connection: EventConnection
  ): Promise<void> {
    if (
      !connection.activeItem ||
      connection.activeItem.type !== 'question' ||
      ws.data.role !== 'team' ||
      !ws.data.languageId
    ) {
      return;
    }

    const { id, languageId } = ws.data;

    try {
      const answers: { question_id: string; answer: string }[] = await sql`
        SELECT a.id, a.answer, a.question_id
        FROM answers a
        JOIN translations t ON t.id = a.translation_id
        WHERE a.question_id = ${connection.activeItem.id}
          AND a.team_id = ${id}
          AND t.language_id = ${languageId}
      `;

      if (answers.length > 0) {
        const answer = answers[0]!;

        ws.send(
          JSON.stringify({
            type: 'SAVED_ANSWER',
            questionId: answer.question_id,
            answer: answer.answer
          })
        );
      }
    } catch {}
  }

  async broadcastToAllLanguageChannels(eventId: string, message: string): Promise<void> {
    const eventLanguages = this.eventConnections.get(eventId)?.languages;

    if (eventLanguages) {
      Object.values(eventLanguages).forEach((lang) => this.server?.publish(`${eventId}:${lang.code}`, message));
    }
  }

  private async handleSUBMIT_ANSWER(
    ws: ServerWebSocket<WebsocketData>,
    connection: EventConnection,
    answer: string
  ): Promise<void> {
    if (ws.data.role !== 'team') {
      return;
    }

    const { id, languageId } = ws.data;

    // Validate language selected
    if (!languageId) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'NO_LANGUAGE_SELECTED',
          message: 'Please select a language first'
        })
      );

      return;
    }

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
    let isValid = false;

    if (connection.activeItem.startTime === null) {
      isValid = true; // No timer set, so always valid
    } else {
      const now = Date.now();
      const startTime = new Date(connection.activeItem.startTime).getTime();
      const deadline = startTime + connection.activeItem.seconds * 1000 + connection.run.gracePeriod * 1000;

      if (now <= deadline) {
        isValid = true;
      }
    }

    if (!isValid) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'TIME_EXCEEDED',
          message: 'Answer submitted after time limit'
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
        VALUES (${answerId}, ${answer}, ${connection.activeItem.id}, ${id}, ${translationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (question_id, team_id)
        DO UPDATE SET answer = EXCLUDED.answer, updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

    const finalAnswerId = result[0]!.id;

    // Notify
    const message = JSON.stringify({
      type: 'ANSWER_RECEIVED',
      teamId: id,
      teamNumber,
      questionId: connection.activeItem.id,
      translationId,
      languageCode,
      answerId: finalAnswerId,
      answerText: answer
    });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
  }

  private async handleUPDATE_RUN_STATUS(
    connection: EventConnection,
    status: 'not_started' | 'in_progress' | 'paused' | 'completed'
  ): Promise<void> {
    connection.run.status = status;

    if (status === 'not_started') {
      await sql`DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE event_id = ${connection.eventId})`;
    }

    await sql`
        UPDATE runs
        SET status = ${status}
        WHERE event_id = ${connection.eventId}
      `;

    const message = JSON.stringify({ type: 'RUN_STATUS', status });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    await this.broadcastToAllLanguageChannels(connection.eventId, message);
  }

  private async handleUPDATE_GRACE_PERIOD(connection: EventConnection, gracePeriod: number): Promise<void> {
    connection.run.gracePeriod = gracePeriod;

    await sql`
        UPDATE runs
        SET grace_period = ${gracePeriod}
        WHERE event_id = ${connection.eventId}
      `;

    const message = JSON.stringify({ type: 'GRACE_PERIOD', gracePeriod });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    await this.broadcastToAllLanguageChannels(connection.eventId, message);
  }

  private async handleSET_ACTIVE_ITEM(connection: EventConnection, activeItem: ActiveItem): Promise<void> {
    connection.activeItem = activeItem;

    await sql`
      UPDATE runs
      SET active_item = ${activeItem}::jsonb
      WHERE event_id = ${connection.eventId}
    `;

    const message = JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:presenters`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
    await this.broadcastToAllLanguageChannels(connection.eventId, message);
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
      answerId,
      questionId: answer.question_id,
      teamId: answer.team_id,
      points
    });

    this.server?.publish(`${connection.eventId}:hosts`, message);
    this.server?.publish(`${connection.eventId}:judges`, message);
  }
}
