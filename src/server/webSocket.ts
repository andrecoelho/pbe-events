import { sql, type ServerWebSocket } from 'bun';
import type { Session } from '@/server/types';
import type { ActiveItem } from '@/types';
import { textServerError } from '@/server/utils/responses';

export type TeamWebsocketData = {
  role: 'team';
  eventId: string;
  teamId: string;
  languageId: string | null;
  languageCode: string | null;
};

export type HostWebsocketData = {
  role: 'host';
  session: Session;
  eventId: string;
};

export type WebsocketData = HostWebsocketData | TeamWebsocketData;

export interface EventConnection {
  eventId: string;
  host: ServerWebSocket<WebsocketData> | null;
  teams: Map<string, ServerWebSocket<TeamWebsocketData>>;
  run: Run | null;
  activeItem: ActiveItem | null;
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

  async upgradeWebSocket(req: Request, session: Session | null): Promise<Response | undefined> {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    const eventId = url.searchParams.get('eventId');
    const teamId = url.searchParams.get('teamId');

    if (!eventId || !role) {
      return;
    }

    if (role !== 'host' && role !== 'team') {
      return;
    }

    try {
      // Check if event exists
      const events: { id: string }[] = await sql`SELECT id FROM events WHERE id = ${eventId}`;

      if (events.length === 0) {
        return;
      }

      if (role === 'host') {
        if (!session) {
          return;
        }

        // Check if host is already connected
        if (this.eventConnections.has(eventId) && this.eventConnections.get(eventId)!.host) {
          return;
        }

        // Validate session and permissions for host
        const permissions: { role_id: string }[] = await sql`
          SELECT role_id
          FROM permissions
          WHERE user_id = ${session!.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
        `;

        if (permissions.length === 0) {
          return;
        }
      } else {
        if (!teamId) {
          return;
        }

        // Validate team exists for team role
        const teams: { id: string }[] = await sql`SELECT id FROM teams WHERE id = ${teamId} AND event_id = ${eventId}`;

        if (teams.length === 0) {
          return;
        }
      }

      const upgraded = this.server.upgrade(req, {
        data:
          role === 'host'
            ? {
                role: 'host',
                session: session!,
                eventId
              }
            : {
                role: 'team',
                eventId,
                teamId,
                languageId: null,
                languageCode: null
              }
      });

      if (upgraded) {
        return;
      }

      return textServerError('WebSocket upgrade failed');
    } catch (error) {
      return textServerError('WebSocket upgrade failed');
    }
  }

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { eventId } = ws.data;

    if (!eventId) {
      ws.close();
      return;
    }

    try {
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
      } else if (this.isTeamWebSocket(ws)) {
        const { teamId } = ws.data;

        // Close existing connection if team reconnecting
        if (connection.teams.has(teamId)) {
          connection.teams.get(teamId)?.close();
        }

        connection.teams.set(teamId, ws);

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
          WHERE t.id = ${teamId}
        `;

        if (teams.length > 0) {
          const team = teams[0]!;

          ws.data.languageId = team.language_id;
          ws.data.languageCode = team.code;

          // Subscribe to language channel if language selected
          if (team.code) {
            ws.subscribe(`${eventId}:${team.code}`);

            // Send TEAM_CONNECTED to host
            connection.host?.send(
              JSON.stringify({
                type: 'TEAM_STATUS',
                teams: [
                  {
                    id: teamId,
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
                    id: teamId,
                    status: 'connected',
                    name: team.name,
                    number: team.number,
                    languageCode: null
                  }
                ]
              })
            );
          }

          ws.send(JSON.stringify({ type: 'ACTIVE_ITEM', activeItem: connection.activeItem }));

          // Send existing answer if active question and team has language
          if (connection.activeItem && connection.activeItem.type === 'question' && ws.data.languageId) {
            await this.sendExistingAnswerToTeam(ws, connection);
          }
        }
      }
    } catch (error) {
      console.log('WebSocket open error', error);
      ws.close();
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
    } else {
      const { teamId, languageCode } = ws.data;

      connection.teams.delete(teamId);

      // Unsubscribe from language channel
      if (languageCode) {
        ws.unsubscribe(`${eventId}:${languageCode}`);
      }

      // Notify host
      const message = JSON.stringify({
        type: 'TEAM_DISCONNECTED',
        teamId
      });

      connection.host?.send(message);
    }

    // Clean up empty connections
    if (!connection.host && connection.teams.size === 0) {
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
    this.eventConnections.set(eventId, {
      eventId,
      host: null,
      teams: new Map(),
      run: null,
      activeItem: null
    });

    const [run]: {
      event_id: string;
      status: string;
      grace_period: number;
      active_item: ActiveItem | null;
    }[] = await sql`
      SELECT event_id, status, grace_period, active_item
      FROM runs
      WHERE event_id = ${eventId}
    `;

    if (run) {
      const connection = this.eventConnections.get(eventId)!;

      connection.run = {
        status: run.status as 'not_started' | 'in_progress' | 'paused' | 'completed',
        gracePeriod: run.grace_period
      };

      connection.activeItem = run.active_item;
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

    const { teamId, languageId } = ws.data;

    try {
      const answers: { id: string; answer: string }[] = await sql`
        SELECT a.id, a.answer
        FROM answers a
        JOIN translations t ON t.id = a.translation_id
        WHERE a.question_id = ${connection.activeItem.id}
          AND a.team_id = ${teamId}
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

    if (ws.data.languageId) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'LANGUAGE_ALREADY_SELECTED',
          message: 'Language has already been selected'
        })
      );

      return;
    }

    const { teamId } = ws.data;

    // Update team language
    await sql`UPDATE teams SET language_id = ${languageId} WHERE id = ${teamId}`;

    // Get language code and team details
    const results: { code: string; name: string; number: number }[] = await sql`
        SELECT l.code, t.name, t.number
        FROM languages l
        JOIN teams t ON t.id = ${teamId}
        WHERE l.id = ${languageId}
      `;

    if (results.length > 0) {
      const { code, name, number } = results[0]!;

      ws.data.languageId = languageId;
      ws.data.languageCode = code;

      // Subscribe to language channel
      ws.subscribe(`${connection.eventId}:${code}`);

      // Notify host
      const message = JSON.stringify({
        type: 'TEAM_READY',
        teamId,
        teamName: name,
        teamNumber: number,
        languageCode: code
      });

      connection.host?.send(message);

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

    const { teamId, languageId } = ws.data;

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
      const deadline = startTime + connection.activeItem.seconds * 1000 + connection.run!.gracePeriod * 1000;

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
        VALUES (${answerId}, ${answer}, ${connection.activeItem.id}, ${teamId}, ${translationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (question_id, team_id)
        DO UPDATE SET answer = EXCLUDED.answer, updated_at = CURRENT_TIMESTAMP
      `;

    // Notify host
    connection.host?.send(JSON.stringify({ type: 'ANSWER_RECEIVED', teamId }));
  }

  private async handleUPDATE_RUN_STATUS(
    connection: EventConnection,
    status: 'not_started' | 'in_progress' | 'paused' | 'completed'
  ): Promise<void> {
    connection.run!.status = status;

    if (status === 'not_started') {
      await sql`DELETE FROM answers WHERE team_id IN (SELECT id FROM teams WHERE event_id = ${connection.eventId})`;
    }

    await sql`
        UPDATE runs
        SET status = ${status}
        WHERE event_id = ${connection.eventId}
      `;

    connection.host?.send(JSON.stringify({ type: 'RUN_STATUS_CHANGED', status }));

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

    await this.broadcastToAllLanguageChannels(connection.eventId, {
      type: 'ACTIVE_ITEM',
      activeItem: connection.activeItem
    });
  }
}
