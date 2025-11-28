import { sql, type ServerWebSocket } from 'bun';
import type { Session, Run, ActiveItemCache } from '@/server/types';
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
  activeItem: ActiveItemCache | null;
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

  completeRun(eventId: string): void {
    const connection = this.eventConnections.get(eventId);

    if (!connection) {
      return;
    }

    // Remove the cached connection first so handleClose ignores the teardown closes
    this.eventConnections.delete(eventId);

    connection.host?.close();

    for (const ws of connection.teams.values()) {
      ws.close();
    }
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
          if (connection.activeItem && connection.activeItem.type === 'question' && ws.data.languageId) {
            await this.sendExistingAnswerToTeam(ws, connection);
          }
        }
      }
    } catch (error) {
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
        ws.send(JSON.stringify({ type: 'HOST_DISCONNECTED' }));
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
    } catch (error) {}
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
          | { type: 'PAUSE_RUN' }
          | { type: 'RESUME_RUN' }
          | { type: 'SHOW_ANSWER' }
          | { type: 'END_QUESTION' }
          | { type: 'SHOW_SLIDE'; slideId: string }
          | { type: 'COMPLETE_RUN' };

        switch (msg.type) {
          case 'START_QUESTION':
            await this.handleSTART_QUESTION(connection, msg.questionId, msg.hasTimer);
            break;
          case 'PAUSE_RUN':
            await this.handlePAUSE_RUN(connection);
            break;
          case 'RESUME_RUN':
            await this.handleRESUME_RUN(connection);
            break;
          case 'SHOW_ANSWER':
            await this.handleSHOW_ANSWER(connection);
            break;
          case 'END_QUESTION':
            await this.handleEND_QUESTION(connection);
            break;
          case 'SHOW_SLIDE':
            await this.handleSHOW_SLIDE(connection, msg.slideId);
            break;
          case 'COMPLETE_RUN':
            await this.handleCOMPLETE_RUN(connection);
            break;
        }
      }
    } catch (error) {
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
      activeItem: null
    });

    // Query and cache run
    const [run]: {
      event_id: string;
      status: string;
      grace_period: number;
      active_id: string | null;
      active_phase: string | null;
      active_start_time: string | null;
      active_has_timer: boolean | null;
    }[] = await sql`
      SELECT event_id, status, grace_period, active_id, active_phase, active_start_time, active_has_timer
      FROM runs
      WHERE event_id = ${eventId}
    `;

    if (run) {
      const connection = this.eventConnections.get(eventId)!;

      connection.run = {
        eventId: run.event_id,
        status: run.status as 'not_started' | 'in_progress' | 'paused' | 'completed',
        gracePeriod: run.grace_period
      };

      // Cache active item if exists
      if (run.active_id && run.active_phase && run.active_start_time && run.active_has_timer !== null) {
        const [question]: { seconds: number }[] = await sql`SELECT seconds FROM questions WHERE id = ${run.active_id}`;

        if (question) {
          connection.activeItem = {
            id: run.active_id,
            type: 'question',
            phase: run.active_phase as 'prompt' | 'answer' | 'ended',
            seconds: question.seconds,
            startTime: run.active_start_time,
            hasTimer: run.active_has_timer
          };
        } else {
          // It's a slide
          connection.activeItem = {
            id: run.active_id,
            type: 'slide',
            phase: 'slide',
            seconds: 0,
            startTime: run.active_start_time,
            hasTimer: run.active_has_timer
          };
        }
      }
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
    try {
      const languages: { code: string }[] = await sql`
        SELECT DISTINCT code FROM languages WHERE event_id = ${eventId}
      `;

      const messageStr = JSON.stringify(message);
      languages.forEach((lang) => {
        this.server.publish(`${eventId}:${lang.code}`, messageStr);
      });
    } catch {}
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
        if (connection.activeItem && connection.activeItem.type === 'question') {
          await this.sendExistingAnswerToTeam(ws, connection);
        }
      }
    } catch {
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
    if (connection.activeItem!.hasTimer) {
      const now = Date.now();
      const startTime = new Date(connection.activeItem.startTime).getTime();
      const deadline = startTime + connection.activeItem.seconds * 1000 + connection.run!.gracePeriod * 1000;

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
      const message = JSON.stringify({
        type: 'ANSWER_RECEIVED',
        teamId,
        hasAnswer: true
      });

      connection.host?.send(message);
    } catch {
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
      return;
    }

    try {
      // Generate timestamp
      const activeStartTime = new Date().toISOString();

      // Update run
      await sql`
        UPDATE runs
        SET active_id = ${questionId},
            active_phase = 'prompt',
            active_start_time = ${activeStartTime},
            active_has_timer = ${hasTimer}
        WHERE event_id = ${connection.eventId}
      `;

      // Get question seconds and update connection cache
      const [question]: { seconds: number }[] = await sql`
        SELECT seconds FROM questions WHERE id = ${questionId}
      `;

      if (question) {
        connection.activeItem = {
          id: questionId,
          type: 'question',
          phase: 'prompt',
          seconds: question.seconds,
          startTime: activeStartTime,
          hasTimer
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
          seconds: connection.activeItem!.seconds,
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
    } catch {}
  }

  private async handlePAUSE_RUN(connection: EventConnection): Promise<void> {
    if (!connection.run) {
      return;
    }

    try {
      connection.run.status = 'paused';

      await sql`UPDATE runs SET status = 'paused' WHERE event_id = ${connection.eventId}`;
      await this.broadcastToAllLanguageChannels(connection.eventId, { type: 'RUN_PAUSED' });
    } catch {}
  }

  private async handleRESUME_RUN(connection: EventConnection): Promise<void> {
    if (!connection.run) {
      return;
    }

    try {
      connection.run.status = 'in_progress';

      await sql`UPDATE runs SET status = 'in_progress' WHERE event_id = ${connection.eventId}`;
      await this.broadcastToAllLanguageChannels(connection.eventId, { type: 'RUN_RESUMED' });
    } catch {}
  }

  private async handleSHOW_ANSWER(connection: EventConnection): Promise<void> {
    if (!connection.run) {
      return;
    }

    if (!connection.activeItem || connection.activeItem.type !== 'question') {
      return;
    }

    try {
      // Update run to answer phase
      await sql`
        UPDATE runs
        SET active_phase = 'answer'
        WHERE event_id = ${connection.eventId}
      `;

      connection.activeItem.phase = 'answer';

      // Get all translations with answers
      const translations: {
        code: string;
        answer: string;
        clarification: string | null;
      }[] = await sql`
        SELECT l.code, t.answer, t.clarification
        FROM translations t
        JOIN languages l ON l.id = t.language_id
        WHERE t.question_id = ${connection.activeItem.id}
      `;

      // Broadcast to all language channels
      await this.broadcastToAllLanguageChannels(connection.eventId, {
        type: 'ANSWER_SHOWN',
        translations: translations.map((t) => ({
          languageCode: t.code,
          answer: t.answer,
          clarification: t.clarification
        }))
      });
    } catch {}
  }

  private async handleEND_QUESTION(connection: EventConnection): Promise<void> {
    if (!connection.run) {
      return;
    }

    try {
      // Update run to ended phase
      await sql`
        UPDATE runs
        SET active_phase = 'ended'
        WHERE event_id = ${connection.eventId}
      `;

      if (connection.activeItem) {
        connection.activeItem.phase = 'ended';
      }

      // Broadcast to all language channels
      await this.broadcastToAllLanguageChannels(connection.eventId, {
        type: 'QUESTION_ENDED'
      });
    } catch {}
  }

  private async handleSHOW_SLIDE(connection: EventConnection, slideId: string): Promise<void> {
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
        WHERE id = ${slideId} AND event_id = ${connection.eventId}
      `;

      if (slides.length > 0) {
        const slide = slides[0]!;
        const activeStartTime = new Date().toISOString();

        // Update run with slide
        await sql`
          UPDATE runs
          SET active_id = ${slideId},
              active_phase = 'slide',
              active_start_time = ${activeStartTime},
              active_has_timer = false
          WHERE event_id = ${connection.eventId}
        `;

        // Update cache
        connection.activeItem = {
          id: slideId,
          type: 'slide',
          phase: 'slide',
          seconds: 0,
          startTime: activeStartTime,
          hasTimer: false
        };

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
    } catch {}
  }

  private async handleCOMPLETE_RUN(connection: EventConnection): Promise<void> {
    if (!connection.run) {
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
    } catch (error) {}
  }
}
