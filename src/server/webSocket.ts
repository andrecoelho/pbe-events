import { sql, type ServerWebSocket } from 'bun';
import type { Session } from '@/server/types';
import type { ActiveItem } from '@/types';
import {
  textBadRequest,
  textForbidden,
  textNotFound,
  textServerError,
  textUnauthorized
} from '@/server/utils/responses';

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

export type PresenterWebsocketData = {
  role: 'presenter';
  session: Session;
  eventId: string;
};

export type WebsocketData = HostWebsocketData | PresenterWebsocketData | TeamWebsocketData;

export interface EventConnection {
  eventId: string;
  eventName: string;
  host: ServerWebSocket<HostWebsocketData> | null;
  presenter: ServerWebSocket<PresenterWebsocketData>[];
  teams: Map<string, ServerWebSocket<TeamWebsocketData>>;
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
  private server: any = null;

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

  private isPresenterWebSocket(ws: ServerWebSocket<WebsocketData>): ws is ServerWebSocket<PresenterWebsocketData> {
    return ws.data.role === 'presenter';
  }

  async upgradeWebSocket(req: Request, session: Session | null): Promise<Response | undefined> {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    const eventId = url.searchParams.get('eventId');
    const teamId = url.searchParams.get('teamId');

    if (!eventId || !role) {
      return textBadRequest('Missing eventId or role');
    }

    if (role !== 'host' && role !== 'team' && role !== 'presenter') {
      return textBadRequest('Invalid role');
    }

    // Check if event exists
    const events: { id: string }[] = await sql`SELECT id FROM events WHERE id = ${eventId}`;

    if (events.length === 0) {
      return textNotFound('Event not found');
    }

    if (role === 'host') {
      if (!session) {
        return textUnauthorized();
      }

      // Check if host is already connected
      if (this.eventConnections.has(eventId) && this.eventConnections.get(eventId)!.host) {
        return textBadRequest('Host already connected');
      }

      // Validate session and permissions for host
      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

      if (permissions.length === 0) {
        return textForbidden();
      }

      if (this.server.upgrade(req, { data: { role: 'host', session, eventId } })) {
        return;
      }
    } else if (role === 'presenter') {
      if (!session) {
        return textUnauthorized();
      }

      // Validate session and permissions for host
      const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

      if (permissions.length === 0) {
        return textForbidden();
      }

      if (this.server.upgrade(req, { role: 'presenter', session, eventId })) {
        return;
      }
    } else {
      if (!teamId) {
        return textBadRequest('Missing teamId');
      }

      if (this.eventConnections.has(eventId) && this.eventConnections.get(eventId)!.teams.has(teamId)) {
        return textBadRequest('Team already connected');
      }

      // Validate team exists for team role
      const teams: { id: string; name: string; number: number; languageId: string | null }[] =
        await sql`SELECT id, name, number, language_id FROM teams WHERE id = ${teamId} AND event_id = ${eventId}`;

      if (teams.length === 0) {
        return textNotFound('Team not found');
      }

      if (
        this.server.upgrade(req, {
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

    return textServerError('WebSocket upgrade failed');
  }

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { eventId } = ws.data;

    if (!eventId) {
      ws.close();
      return;
    }

    // Initialize connection tracking if needed
    if (!this.eventConnections.has(eventId)) {
      await this.initializeEventConnection(eventId);
    }

    const connection = this.eventConnections.get(eventId)!;

    if (this.isHostWebSocket(ws)) {
      connection.host = ws;

      // Get all teams for this event
      const allTeams: { id: string; name: string; number: number }[] =
        await sql`SELECT id, name, number FROM teams WHERE event_id = ${eventId}`;

      // Build status array for all teams
      const teamStatuses = allTeams.map((team) => {
        const teamWs = connection.teams.get(team.id);

        if (!teamWs) {
          // Team is not connected
          return {
            id: team.id,
            name: team.name,
            number: team.number,
            status: 'offline',
            languageCode: null
          };
        }

        // Team is connected - check if they have selected a language
        if (teamWs.data.languageCode) {
          return {
            id: team.id,
            name: team.name,
            number: team.number,
            status: 'ready',
            languageCode: teamWs.data.languageCode
          };
        }

        // Team is connected but no language selected
        return {
          id: team.id,
          name: team.name,
          number: team.number,
          status: 'connected',
          languageCode: null
        };
      });

      // Send team status message to the newly connected host
      ws.send(JSON.stringify({ type: 'TEAM_STATUS', teams: teamStatuses }));
      ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem }));
    } else if (this.isPresenterWebSocket(ws)) {
      connection.presenter.push(ws);

      ws.send(JSON.stringify({ type: 'LANGUAGES', languages: connection.languages }));
      ws.send(JSON.stringify({ type: 'RUN_STATUS_CHANGED', status: connection.run.status }));
      ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem }));
    } else if (this.isTeamWebSocket(ws)) {
      const { id } = ws.data;

      // Close existing connection if team reconnecting
      if (connection.teams.has(id)) {
        connection.teams.get(id)?.close();
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
            team: { id, name: team.name, number: team.number, languageId: ws.data.languageId }
          })
        );

        ws.send(JSON.stringify({ type: 'LANGUAGES', languages: connection.languages }));

        // Subscribe to language channel if language selected
        if (team.code) {
          ws.subscribe(`${eventId}:${team.code}`);
          ws.send(JSON.stringify({ type: 'RUN_STATUS_CHANGED', status: connection.run.status }));
          ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem }));

          // Send TEAM_CONNECTED to host
          connection.host?.send(
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
          connection.host?.send(
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
      connection.host = null;
    } else if (role === 'presenter') {
      connection.presenter = connection.presenter.filter((presenterWs) => presenterWs !== ws);
    } else {
      const { id, languageCode } = ws.data;

      connection.teams.delete(id);

      // Unsubscribe from language channel
      if (languageCode) {
        ws.unsubscribe(`${eventId}:${languageCode}`);
      }

      const team = connection.teams.get(id)?.data;

      if (team) {
        // Notify host
        connection.host?.send(
          JSON.stringify({
            type: 'TEAM_STATUS',
            team: {
              id,
              status: 'offline',
              name: team.name,
              number: team.number,
              languageCode
            }
          })
        );
      }
    }

    // Clean up empty connections
    if (!connection.host && connection.teams.size === 0 && connection.presenter.length === 0) {
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
      const msg = JSON.parse(message as string) as
        | { type: 'SELECT_LANGUAGE'; languageId: string }
        | { type: 'SUBMIT_ANSWER'; answer: string };

      switch (msg.type) {
        case 'SELECT_LANGUAGE':
          await this.handleSELECT_LANGUAGE(ws, connection, msg.languageId);
          break;
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
          }
        | { type: 'SET_ACTIVE_ITEM'; activeItem: ActiveItem };

      switch (msg.type) {
        case 'UPDATE_RUN_STATUS':
          await this.handleUPDATE_RUN_STATUS(connection, msg.status);
          break;
        case 'SET_ACTIVE_ITEM':
          await this.handleSET_ACTIVE_ITEM(connection, msg.activeItem);
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
      console.log('Initializing event connection for event:', eventId, run);

      // Fetch languages for the event
      const languages: { id: string; code: string; name: string }[] = await sql`
        SELECT id, code, name
        FROM languages
        WHERE event_id = ${eventId}
      `;

      this.eventConnections.set(eventId, {
        eventId,
        eventName: run.name,
        host: null,
        presenter: [],
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
      const answers: { id: string; answer: string }[] = await sql`
        SELECT a.id, a.answer
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
            type: 'YOUR_ANSWER',
            answerId: answer.id,
            answer: answer.answer
          })
        );
      }
    } catch {}
  }

  async broadcastToAllLanguageChannels(eventId: string, message: any): Promise<void> {
    const languages: { code: string }[] = await sql`
        SELECT DISTINCT code FROM languages WHERE event_id = ${eventId}
      `;

    const messageStr = JSON.stringify(message);

    languages.forEach((lang) => {
      this.server.publish(`${eventId}:${lang.code}`, messageStr);
    });
  }

  private async handleSELECT_LANGUAGE(
    ws: ServerWebSocket<WebsocketData>,
    connection: EventConnection,
    languageId: string
  ): Promise<void> {
    if (ws.data.role !== 'team') {
      return;
    }

    if (ws.data.languageId && connection.run.status !== 'not_started') {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'LANGUAGE_ALREADY_SELECTED',
          message: 'Cannot change language after event has started'
        })
      );

      return;
    }

    const { id } = ws.data;

    // Update team language
    await sql`UPDATE teams SET language_id = ${languageId} WHERE id = ${id}`;

    // Get language code and team details
    const results: { code: string; name: string; number: number }[] = await sql`
        SELECT l.code, t.name, t.number
        FROM languages l
        JOIN teams t ON t.id = ${id}
        WHERE l.id = ${languageId}
      `;

    if (results.length > 0) {
      const { code, name, number } = results[0]!;

      ws.data.languageId = languageId;
      ws.data.languageCode = code;

      // Subscribe to language channel
      ws.subscribe(`${connection.eventId}:${code}`);

      // Send updated team info to the team
      ws.send(
        JSON.stringify({
          type: 'TEAM_INFO',
          team: { id, name, number, languageId }
        })
      );

      // Send run status and active item after language selection
      ws.send(JSON.stringify({ type: 'RUN_STATUS_CHANGED', status: connection.run.status }));
      ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem }));

      // Notify host
      connection.host?.send(
        JSON.stringify({
          type: 'TEAM_STATUS',
          teams: [
            {
              id,
              name,
              number,
              languageCode: code,
              status: 'ready'
            }
          ]
        })
      );

      // Send existing answer if active question
      if (connection.activeItem && connection.activeItem.type === 'question') {
        await this.sendExistingAnswerToTeam(ws, connection);
      }
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
    const translations: { id: string }[] = await sql`
        SELECT id FROM translations
        WHERE question_id = ${connection.activeItem.id}
          AND language_id = ${languageId}
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
    const answerId = Bun.randomUUIDv7();

    // Upsert answer
    await sql`
        INSERT INTO answers (id, answer, question_id, team_id, translation_id, created_at, updated_at)
        VALUES (${answerId}, ${answer}, ${connection.activeItem.id}, ${id}, ${translationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (question_id, team_id)
        DO UPDATE SET answer = EXCLUDED.answer, updated_at = CURRENT_TIMESTAMP
      `;

    // Notify host
    connection.host?.send(JSON.stringify({ type: 'ANSWER_RECEIVED', id }));
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

    connection.host?.send(JSON.stringify({ type: 'RUN_STATUS_CHANGED', status }));

    connection.presenter.forEach((presenterWs) =>
      presenterWs.send(JSON.stringify({ type: 'RUN_STATUS_CHANGED', status }))
    );

    await this.broadcastToAllLanguageChannels(connection.eventId, { type: 'RUN_STATUS_CHANGED', status });
  }

  private async handleSET_ACTIVE_ITEM(connection: EventConnection, activeItem: ActiveItem): Promise<void> {
    connection.activeItem = activeItem;

    await sql`
      UPDATE runs
      SET active_item = ${activeItem}::jsonb
      WHERE event_id = ${connection.eventId}
    `;

    connection.host?.send(
      JSON.stringify({
        type: 'ACTIVE_ITEM',
        activeItem: connection.activeItem
      })
    );

    connection.presenter.forEach((presenterWs) =>
      presenterWs.send(
        JSON.stringify({
          type: 'ACTIVE_ITEM',
          activeItem: connection.activeItem
        })
      )
    );

    await this.broadcastToAllLanguageChannels(connection.eventId, {
      type: 'ACTIVE_ITEM',
      activeItem: connection.activeItem
    });
  }
}
