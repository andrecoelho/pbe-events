import { sql, type ServerWebSocket } from 'bun';
import type { Session, Run, ActiveQuestionCache } from '@/server/types';
import { textBadRequest, textForbidden, textServerError, textUnauthorized } from '@/server/utils/responses';

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
  activeQuestion: ActiveQuestionCache | null;
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

  hasConnection(eventId: string): boolean {
    return this.eventConnections.has(eventId);
  }

  getConnection(eventId: string): EventConnection | undefined {
    return this.eventConnections.get(eventId);
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

    if (!eventId || !teamId || !role) {
      return textBadRequest('Missing eventId, teamId, or role');
    }

    if (role !== 'host' && role !== 'team') {
      return textBadRequest('Invalid role, must be host or team');
    }

    try {
      // Check if event exists
      const events: { id: string }[] = await sql`SELECT id FROM events WHERE id = ${eventId}`;

      if (events.length === 0) {
        return textBadRequest('Event not found');
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
          return textForbidden('Unauthorized - requires owner or admin role to host event');
        }
      } else {
        // Validate team exists for team role
        const teams: { id: string }[] = await sql`SELECT id FROM teams WHERE id = ${teamId} AND event_id = ${eventId}`;

        if (teams.length === 0) {
          return textBadRequest('Invalid team ID');
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
      console.error('Error during WebSocket upgrade:', error);
      return textServerError('WebSocket upgrade failed');
    }
  }

  // Called when a new WebSocket connection is opened
  private handleOpen = async (ws: ServerWebSocket<WebsocketData>) => {
    const { eventId, role } = ws.data;

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
        console.log(`Host connected to event ${eventId}`);

        // Get all teams for this event
        const allTeams: { id: string; name: string; number: number }[] =
          await sql`SELECT id, name, number FROM teams WHERE event_id = ${eventId}`;

        // Build status array for all teams
        const teamStatuses = allTeams.map((team) => {
          const teamWs = connection.teams.get(team.id);

          if (!teamWs) {
            // Team is not connected
            return {
              teamId: team.id,
              teamName: team.name,
              teamNumber: team.number,
              status: 'TEAM_OFFLINE',
              languageCode: null
            };
          }

          // Team is connected - check if they have selected a language
          if (teamWs.data.languageCode) {
            return {
              teamId: team.id,
              teamName: team.name,
              teamNumber: team.number,
              status: 'TEAM_READY',
              languageCode: teamWs.data.languageCode
            };
          }

          // Team is connected but no language selected
          return {
            teamId: team.id,
            teamName: team.name,
            teamNumber: team.number,
            status: 'TEAM_CONNECTED',
            languageCode: null
          };
        });

        // Send team status message to the newly connected host
        ws.send(JSON.stringify({ type: 'TEAM_STATUS', teams: teamStatuses }));
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
                type: 'TEAM_READY',
                teamId,
                teamName: team.name,
                teamNumber: team.number,
                languageCode: team.code
              })
            );
          } else {
            connection.host?.send(
              JSON.stringify({
                type: 'TEAM_CONNECTED',
                teamId,
                teamName: team.name,
                teamNumber: team.number,
                languageCode: null
              })
            );
          }

          // Send existing answer if active question and team has language
          if (connection.activeQuestion && ws.data.languageId) {
            await this.sendExistingAnswerToTeam(ws, connection);
          }
        }

        console.log(`Team ${teamId} connected to event ${eventId}`);
      }
    } catch (error) {
      console.error('Error in WebSocket open handler:', error);
      ws.close();
    }
  };

  // Called when a WebSocket connection is closed
  private handleClose = async (ws: ServerWebSocket<WebsocketData>, code: number, reason: string) => {
    const { eventId, role } = ws.data;

    if (!eventId) {
      return;
    }

    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    try {
      if (role === 'host') {
        connection.host = null;
        await this.handlePAUSE(connection);
        console.log(`Host disconnected from event ${eventId}`);
      } else {
        // TypeScript now knows ws.data is the team variant
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
        console.log(`Team ${teamId} disconnected from event ${eventId}`);
      }

      // Clean up empty connections
      if (!connection.host && connection.teams.size === 0) {
        this.eventConnections.delete(eventId);
        console.log(`Event connection ${eventId} cleaned up`);
      }
    } catch (error) {
      console.error('Error in WebSocket close handler:', error);
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

    try {
      // Handle team messages
      if (role === 'team') {
        const msg = JSON.parse(message as string) as
          | { type: 'SELECT_LANGUAGE'; languageId: string }
          | { type: 'SUBMIT_ANSWER'; answer: string }
          | { type: 'UPDATE_ANSWER'; answer: string };

        switch (msg.type) {
          case 'SELECT_LANGUAGE':
            await this.handleSELECT_LANGUAGE(ws, connection, msg.languageId);
            break;
          case 'SUBMIT_ANSWER':
          case 'UPDATE_ANSWER':
            await this.handleSUBMIT_ANSWER(ws, connection, msg.answer);
            break;
        }
      }

      // Handle host messages
      if (role === 'host') {
        const msg = JSON.parse(message as string) as
          | { type: 'START_QUESTION'; questionId: string; hasTimer: boolean }
          | { type: 'PAUSE' }
          | { type: 'SHOW_SLIDE'; slideNumber: number }
          | { type: 'COMPLETE_RUN' };

        switch (msg.type) {
          case 'START_QUESTION':
            await this.handleSTART_QUESTION(connection, msg.questionId, msg.hasTimer);
            break;
          case 'PAUSE':
            await this.handlePAUSE(connection);
            break;
          case 'SHOW_SLIDE':
            await this.handleSHOW_SLIDE(connection, msg.slideNumber);
            break;
          case 'COMPLETE_RUN':
            await this.handleCOMPLETE_RUN(connection);
            break;
        }
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);

      const errorMsg = JSON.stringify({
        type: 'ERROR',
        code: 'INVALID_ROLE',
        message: 'Error processing message'
      });

      ws.send(errorMsg);
    }
  };

  private async initializeEventConnection(eventId: string): Promise<void> {
    this.eventConnections.set(eventId, {
      eventId,
      host: null,
      teams: new Map(),
      run: null,
      activeQuestion: null
    });

    // Query and cache run
    const [run]: {
      event_id: string;
      status: string;
      grace_period: number;
      has_timer: boolean;
      active_question_id: string | null;
      question_start_time: string | null;
    }[] = await sql`
      SELECT event_id, status, grace_period, has_timer, active_question_id, question_start_time
      FROM runs
      WHERE event_id = ${eventId}
    `;

    if (run) {
      const connection = this.eventConnections.get(eventId)!;

      connection.run = {
        eventId: run.event_id,
        status: run.status as 'not_started' | 'in_progress' | 'completed',
        gracePeriod: run.grace_period,
        hasTimer: run.has_timer,
        activeQuestionId: run.active_question_id,
        questionStartTime: run.question_start_time
      };

      // Cache active question if exists
      if (run.active_question_id) {
        const [question]: { seconds: number }[] = await sql`
          SELECT seconds FROM questions WHERE id = ${run.active_question_id}
        `;

        if (question) {
          connection.activeQuestion = {
            questionId: run.active_question_id,
            seconds: question.seconds,
            startTime: run.question_start_time!
          };
        }
      }
    }
  }

  private async sendExistingAnswerToTeam(
    ws: ServerWebSocket<WebsocketData>,
    connection: EventConnection
  ): Promise<void> {
    if (!connection.activeQuestion || ws.data.role !== 'team' || !ws.data.languageId) {
      return;
    }

    const { teamId, languageId } = ws.data;

    try {
      const answers: { id: string; answer: string }[] = await sql`
        SELECT a.id, a.answer
        FROM answers a
        JOIN translations t ON t.id = a.translation_id
        WHERE a.question_id = ${connection.activeQuestion.questionId}
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
    } catch (error) {
      console.error('Error sending existing answer:', error);
    }
  }

  private async broadcastToAllLanguageChannels(eventId: string, message: any): Promise<void> {
    try {
      const languages: { code: string }[] = await sql`
        SELECT DISTINCT code FROM languages WHERE event_id = ${eventId}
      `;

      const messageStr = JSON.stringify(message);
      languages.forEach((lang) => {
        this.server.publish(`${eventId}:${lang.code}`, messageStr);
      });
    } catch (error) {
      console.error('Error broadcasting to language channels:', error);
    }
  }

  private async handleSELECT_LANGUAGE(
    ws: ServerWebSocket<WebsocketData>,
    connection: EventConnection,
    languageId: string
  ): Promise<void> {
    if (ws.data.role !== 'team') {
      return;
    }

    const { teamId } = ws.data;

    // Check if run has started
    if (connection.run?.status !== 'not_started') {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'RUN_ALREADY_STARTED',
          message: 'Cannot change language after run has started'
        })
      );

      return;
    }

    try {
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

        // TypeScript knows ws.data is team type here
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
        if (connection.activeQuestion) {
          await this.sendExistingAnswerToTeam(ws, connection);
        }
      }
    } catch (error) {
      console.error('Error handling SELECT_LANGUAGE:', error);

      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'INVALID_ROLE',
          message: 'Error selecting language'
        })
      );
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
    if (!connection.activeQuestion) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'NO_ACTIVE_QUESTION',
          message: 'No active question'
        })
      );

      return;
    }

    // Validate deadline if timer enabled
    if (connection.run!.hasTimer) {
      const now = Date.now();
      const startTime = new Date(connection.activeQuestion.startTime).getTime();
      const deadline = startTime + connection.activeQuestion.seconds * 1000 + connection.run!.gracePeriod * 1000;

      if (now > deadline) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            code: 'DEADLINE_EXCEEDED',
            message: 'Answer submitted after deadline'
          })
        );

        return;
      }
    }

    try {
      // Get translation ID
      const translations: { id: string }[] = await sql`
        SELECT id FROM translations
        WHERE question_id = ${connection.activeQuestion.questionId}
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
        VALUES (${answerId}, ${answer}, ${connection.activeQuestion.questionId}, ${teamId}, ${translationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (question_id, team_id)
        DO UPDATE SET answer = EXCLUDED.answer, updated_at = CURRENT_TIMESTAMP
      `;

      // Notify host
      const message = JSON.stringify({
        type: 'ANSWER_RECEIVED',
        teamId,
        hasAnswer: true
      });

      connection.host?.send(message);
    } catch (error) {
      console.error('Error handling SUBMIT_ANSWER:', error);

      ws.send(
        JSON.stringify({
          type: 'ERROR',
          code: 'INVALID_ROLE',
          message: 'Error submitting answer'
        })
      );
    }
  }

  private async handleSTART_QUESTION(
    connection: EventConnection,
    questionId: string,
    hasTimer: boolean
  ): Promise<void> {
    if (!connection.run) {
      console.error('No run found for connection');
      return;
    }

    try {
      // Generate timestamp
      const questionStartTime = new Date().toISOString();

      // Update run
      await sql`
        UPDATE runs
        SET active_question_id = ${questionId},
            question_start_time = ${questionStartTime},
            has_timer = ${hasTimer}
        WHERE event_id = ${connection.eventId}
      `;

      // Update connection cache
      connection.run.activeQuestionId = questionId;
      connection.run.questionStartTime = questionStartTime;
      connection.run.hasTimer = hasTimer;

      // Get question seconds
      const [question]: { seconds: number }[] = await sql`
        SELECT seconds FROM questions WHERE id = ${questionId}
      `;

      if (question) {
        connection.activeQuestion = {
          questionId,
          seconds: question.seconds,
          startTime: connection.run.questionStartTime
        };
      }

      // Get all translations
      const translations: {
        id: string;
        prompt: string;
        clarification: string | null;
        language_id: string;
        code: string;
      }[] = await sql`
        SELECT t.id, t.prompt, t.clarification, t.language_id, l.code
        FROM translations t
        JOIN languages l ON l.id = t.language_id
        WHERE t.question_id = ${questionId}
      `;

      // Group by language and broadcast
      const languageMap = new Map<string, any>();

      for (const t of translations) {
        languageMap.set(t.code, {
          type: 'QUESTION_STARTED',
          translation: {
            id: t.id,
            prompt: t.prompt,
            clarification: t.clarification,
            languageId: t.language_id,
            questionId
          },
          startTime: Date.now(),
          seconds: connection.activeQuestion!.seconds,
          hasTimer,
          gracePeriod: connection.run.gracePeriod
        });
      }

      // Broadcast to each language channel
      for (const [code, message] of languageMap) {
        this.server.publish(`${connection.eventId}:${code}`, JSON.stringify(message));
      }

      // Send existing answers to teams
      for (const teamWs of connection.teams.values()) {
        await this.sendExistingAnswerToTeam(teamWs, connection);
      }
    } catch (error) {
      console.error('Error handling START_QUESTION:', error);
    }
  }

  private async handlePAUSE(connection: EventConnection): Promise<void> {
    if (!connection.run) {
      console.error('No run found for connection');
      return;
    }

    try {
      // Update run
      await sql`
        UPDATE runs
        SET active_question_id = NULL, question_start_time = NULL
        WHERE event_id = ${connection.eventId}
      `;

      connection.run.activeQuestionId = null;
      connection.run.questionStartTime = null;
      connection.activeQuestion = null;

      // Broadcast to all language channels
      await this.broadcastToAllLanguageChannels(connection.eventId, {
        type: 'QUESTION_ENDED'
      });
    } catch (error) {
      console.error('Error handling PAUSE:', error);
    }
  }

  private async handleSHOW_SLIDE(connection: EventConnection, slideNumber: number): Promise<void> {
    try {
      const slides: {
        id: string;
        event_id: string;
        number: number;
        content: string;
        created_at: string;
      }[] = await sql`
        SELECT id, event_id, number, content, created_at
        FROM slides
        WHERE event_id = ${connection.eventId} AND number = ${slideNumber}
      `;

      if (slides.length > 0) {
        const slide = slides[0]!;

        await this.broadcastToAllLanguageChannels(connection.eventId, {
          type: 'SLIDE_SHOWN',
          slide: {
            id: slide.id,
            eventId: slide.event_id,
            number: slide.number,
            content: slide.content,
            createdAt: slide.created_at
          }
        });
      }
      // Silently ignore if slide not found (don't send error to teams)
    } catch (error) {
      console.error('Error handling SHOW_SLIDE:', error);
    }
  }

  private async handleCOMPLETE_RUN(connection: EventConnection): Promise<void> {
    if (!connection.run) {
      console.error('No run found for connection');
      return;
    }

    try {
      // Update run status
      await sql`UPDATE runs SET status = 'completed' WHERE event_id = ${connection.eventId}`;

      // Get final scores
      const scores: {
        id: string;
        name: string;
        number: number;
        total: number | null;
      }[] = await sql`
        SELECT t.id, t.name, t.number, COALESCE(SUM(a.points_awarded), 0) as total
        FROM teams t
        LEFT JOIN answers a ON a.team_id = t.id
        LEFT JOIN questions q ON q.id = a.question_id
        WHERE t.event_id = ${connection.eventId}
        GROUP BY t.id, t.name, t.number
        ORDER BY total DESC
      `;

      // Broadcast to all language channels
      await this.broadcastToAllLanguageChannels(connection.eventId, {
        type: 'RUN_COMPLETED',
        scores: scores.map((s) => ({
          teamId: s.id,
          teamName: s.name,
          teamNumber: s.number,
          total: s.total || 0
        }))
      });

      // Close all connections
      for (const teamWs of connection.teams.values()) {
        teamWs.close();
      }

      connection.host?.close();
    } catch (error) {
      console.error('Error handling COMPLETE_RUN:', error);
    }
  }
}
