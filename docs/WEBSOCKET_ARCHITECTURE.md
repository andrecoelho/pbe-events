# WebSocket Architecture

## Overview

The PBE Events application uses WebSockets for real-time communication during event runs. The system supports two types of connections:

- **Host**: Admin/Owner users who control the event run (start questions, show slides, etc.)
- **Teams**: Participants who answer questions and receive real-time updates

## Connection Setup

### WebSocket Server
The WebSocket server is created in `src/server/index.ts` and passed to the routes that need it. Connections are managed per event, with support for:
- One host connection per event
- Multiple team connections per event
- Language-specific pub/sub channels for broadcasting translations

### Authentication

Authentication requirements differ between host and team connections:

#### Host Authentication
- **Requires**: Valid session cookie (user must be logged in)
- **Permission Check**: User must have `owner` or `admin` role for the event
- **Validation**: Session is validated from the upgrade request's cookies before establishing the connection
- **Single Connection**: Only one host can be connected per event at a time. If a second host attempts to connect, the connection is rejected with an error.

#### Team Authentication
- **Requires**: Valid team ID in the URL path
- **No Login Required**: Teams do not need to be logged in or have a session
- **Validation**: Server validates that the team ID exists and belongs to the specified event
- **Connection Replacement**: If a team attempts to connect while already connected (e.g., opened in multiple tabs), the new connection replaces the old one. The previous connection is closed and the new one takes over.

This asymmetric authentication model allows event administrators to control the run while teams can participate without account creation or login, using only their team identifier.

### Connection Flow

1. **Host Connection**: `ws://host/events/{eventId}`
   - Validates session cookie and user authentication
   - Checks user has `owner` or `admin` role for the event
   - Ensures no other host is currently connected
   - Stores connection in `connection.host`
   - Receives real-time notifications about all team activity

2. **Team Connection**: `ws://host/events/{eventId}/teams/{teamId}`
   - Validates team ID exists and belongs to the event
   - No session or login required
   - Replaces any existing connection for this team ID
   - Requires language selection before run starts
   - Subscribes to language-specific channel: `${eventId}:${languageCode}`
   - Can reconnect and receive existing answer state

---

## Message Protocol

All messages are JSON strings with a `type` field and associated payload.

### Messages FROM Teams TO Server

#### `SELECT_LANGUAGE`
Team selects their language for receiving question translations. Must be done before the run starts.

```typescript
{
  type: 'SELECT_LANGUAGE',
  languageId: string
}
```

**Response**: Team is subscribed to the language channel and notified to host via `TEAM_READY`

**Errors**:
- `RUN_ALREADY_STARTED` if run has begun
- `INVALID_ROLE` if language not found

---

#### `SUBMIT_ANSWER` / `UPDATE_ANSWER`
Team submits or updates their answer for the active question. Both message types are handled identically.

```typescript
{
  type: 'SUBMIT_ANSWER' | 'UPDATE_ANSWER',
  answer: string
}
```

**Response**:
- Answer stored in database with timestamps
- Host notified via `ANSWER_RECEIVED`
- If past deadline (questionStartTime + seconds + gracePeriod), returns `DEADLINE_EXCEEDED` error

**Errors**:
- `NO_LANGUAGE_SELECTED` if team hasn't selected a language
- `NO_ACTIVE_QUESTION` if no question is running
- `DEADLINE_EXCEEDED` if submitted too late

---

### Messages FROM Host TO Server

#### `START_QUESTION`
Host starts a specific question.

```typescript
{
  type: 'START_QUESTION',
  questionId: string,
  hasTimer: boolean
}
```

**Process**:
1. Validates question belongs to event
2. Updates run record with `active_question_id` and `question_start_time`
3. Loads question translations for all languages
4. Broadcasts `QUESTION_STARTED` to each language channel with appropriate translation
5. Calculates deadline: `startTime + seconds + gracePeriod`

**Errors**:
- `INVALID_ROLE` if question not found

---

#### `PAUSE`
Host pauses/ends the current question.

```typescript
{
  type: 'PAUSE'
}
```

**Process**:
1. Clears `active_question_id` and `question_start_time` in run record
2. Broadcasts `QUESTION_ENDED` to all language channels
3. Grades all submitted answers for the question

---

#### `SHOW_SLIDE`
Host displays a slide to all teams.

```typescript
{
  type: 'SHOW_SLIDE',
  slideNumber: number
}
```

**Process**:
1. Looks up slide by number for the event
2. Broadcasts `SLIDE_SHOWN` to all language channels with slide content

**Errors**:
- `SLIDE_NOT_FOUND` if slide doesn't exist

---

#### `COMPLETE_RUN`
Host completes the entire run.

```typescript
{
  type: 'COMPLETE_RUN'
}
```

**Process**:
1. Updates run status to `completed`
2. Calculates final scores for all teams
3. Broadcasts `RUN_COMPLETED` to all language channels with scores

---

### Messages FROM Server TO Teams

Teams receive messages on their language-specific pub/sub channel (`${eventId}:${languageCode}`).

#### `QUESTION_STARTED`
A question has started with translation in the team's language.

```typescript
{
  type: 'QUESTION_STARTED',
  translation: {
    id: string,
    prompt: string,
    clarification: string | null,
    languageId: string,
    questionId: string
  },
  startTime: number,        // Unix timestamp in milliseconds
  seconds: number,          // Time limit for question
  hasTimer: boolean,        // Whether timer is enforced
  gracePeriod: number       // Extra seconds after timer
}
```

**Team Action**: Display question and start countdown if `hasTimer` is true

---

#### `QUESTION_ENDED`
Current question has ended/paused.

```typescript
{
  type: 'QUESTION_ENDED'
}
```

**Team Action**: Stop accepting answers, hide question interface

---

#### `SLIDE_SHOWN`
A slide is being displayed.

```typescript
{
  type: 'SLIDE_SHOWN',
  slide: {
    id: string,
    eventId: string,
    number: number,
    content: string,        // Markdown content
    createdAt: string
  }
}
```

**Team Action**: Render slide content (Markdown)

---

#### `RUN_COMPLETED`
Run finished with final scores.

```typescript
{
  type: 'RUN_COMPLETED',
  scores: Array<{
    teamId: string,
    teamName: string,
    teamNumber: number,
    total: number           // Total points earned
  }>
}
```

**Team Action**: Display final leaderboard

---

#### `YOUR_ANSWER`
Sent to reconnecting team if they have an existing answer for the active question.

```typescript
{
  type: 'YOUR_ANSWER',
  answerId: string,
  answer: string
}
```

**Team Action**: Pre-populate answer field with existing submission

---

#### `ERROR`
An error occurred processing the team's request.

```typescript
{
  type: 'ERROR',
  code: ErrorCode,
  message: string
}
```

**Error Codes**:
- `NO_ACTIVE_RUN` - No active run exists for the event
- `INVALID_TEAM` - Team ID is invalid or doesn't belong to event
- `UNAUTHORIZED` - Session/authentication required
- `RUN_ALREADY_STARTED` - Cannot perform action after run has started
- `NO_LANGUAGE_SELECTED` - Team must select a language before answering
- `NO_ACTIVE_QUESTION` - No question is currently active
- `DEADLINE_EXCEEDED` - Answer submitted after time limit + grace period
- `TRANSLATION_NOT_FOUND` - Question translation not found for language
- `SLIDE_NOT_FOUND` - Requested slide doesn't exist
- `INVALID_ROLE` - Generic error for invalid operations

---

### Messages FROM Server TO Host

Host receives direct messages (not via pub/sub) about team activity.

#### `TEAM_CONNECTED`
A team connected or reconnected.

```typescript
{
  type: 'TEAM_CONNECTED',
  teamId: string,
  teamName: string,
  teamNumber: number,
  languageCode: string    // e.g., 'en', 'es'
}
```

---

#### `TEAM_DISCONNECTED`
A team disconnected.

```typescript
{
  type: 'TEAM_DISCONNECTED',
  teamId: string
}
```

---

#### `ANSWER_RECEIVED`
Team submitted or updated an answer.

```typescript
{
  type: 'ANSWER_RECEIVED',
  teamId: string,
  hasAnswer: boolean
}
```

**Note**: `hasAnswer` is `false` if team cleared their answer, `true` if they submitted content

---

#### `TEAM_READY`
Team selected a language and is ready to participate.

```typescript
{
  type: 'TEAM_READY',
  teamId: string,
  teamName: string,
  teamNumber: number,
  languageCode: string
}
```

---

#### `GRACE_PERIOD_UPDATED`
Grace period was changed via API (not from WebSocket).

```typescript
{
  type: 'GRACE_PERIOD_UPDATED',
  gracePeriod: number     // New grace period in seconds
}
```

**Trigger**: `PATCH /api/runs/:runId` with `action: 'updateGracePeriod'`

---

## State Management

### Connection Cache
The WebSocket server maintains in-memory state for each event:

```typescript
{
  eventId: string,
  host: ServerWebSocket | null,
  teams: Map<teamId, {
    ws: ServerWebSocket,
    teamName: string,
    teamNumber: number,
    languageCode: string | null
  }>,
  run: {
    id: string,
    status: 'not_started' | 'in_progress' | 'completed',
    gracePeriod: number,
    activeQuestionId: string | null,
    questionStartTime: number | null,  // Unix timestamp
    hasTimer: boolean
  } | null
}
```

### Language Channels
Teams are subscribed to pub/sub channels based on their selected language:
- Channel format: `${eventId}:${languageCode}`
- Example: `abc123:en`, `abc123:es`
- All broadcasts use these channels to send language-specific translations

### Answer Persistence
Answers are immediately persisted to the database:

```sql
INSERT INTO answers (id, run_id, team_id, question_id, answer, submitted_at)
ON CONFLICT (run_id, team_id, question_id)
DO UPDATE SET answer = EXCLUDED.answer, submitted_at = EXCLUDED.submitted_at
```

This allows teams to reconnect and resume their work without losing progress.

---

## Timing & Deadlines

### Question Timer Flow
1. Host sends `START_QUESTION` with `hasTimer: true`
2. Server records `question_start_time` in database
3. Teams receive `QUESTION_STARTED` with:
   - `startTime`: When question started (ms timestamp)
   - `seconds`: Time limit (e.g., 30 seconds)
   - `gracePeriod`: Extra time allowed (e.g., 2 seconds)
4. **Deadline**: `startTime + (seconds * 1000) + (gracePeriod * 1000)`

### Answer Submission Validation
When a team submits an answer:
```typescript
const deadline = questionStartTime + (seconds * 1000) + (gracePeriod * 1000);
const now = Date.now();

if (now > deadline) {
  return { type: 'ERROR', code: 'DEADLINE_EXCEEDED', message: '...' };
}
```

### Grace Period Updates
Grace period can be updated via REST API:
```bash
PATCH /api/runs/:runId
{ "action": "updateGracePeriod", "gracePeriod": 5 }
```

This sends `GRACE_PERIOD_UPDATED` to the host and updates the cached run state.

---

## Error Handling

### Connection Errors
- **Authentication failure**: Upgrade request rejected with 401
- **Permission denied**: Connection closed with error message
- **Host already connected**: Second host connection rejected
- **Invalid team**: Team connection rejected if team doesn't belong to event

### Message Errors
All validation errors are sent back to the client as `ERROR` messages with specific error codes. The connection remains open for retry.

### Disconnection Handling
- **Team disconnect**: Host notified, team can reconnect without losing state
- **Host disconnect**: Teams continue running, new host can connect
- **Server restart**: All connections lost, clients should implement reconnection logic

---

## Security Considerations

1. **Session Validation**: Host connections validate the session cookie; team connections validate team ID only
2. **Permission Checks**: Host actions require `owner` or `admin` role
3. **Team Isolation**: Teams can only submit answers for their own team
4. **Event Isolation**: All operations scoped to specific event IDs
5. **SQL Injection Prevention**: All queries use parameterized statements via Bun SQL

---

## Integration with REST API

The WebSocket system integrates with REST endpoints:

- **Create Run**: `POST /api/events/:eventId/runs`
  - Creates run record before WebSocket connection
  - Sets initial grace period and status

- **Update Run**: `PATCH /api/runs/:runId`
  - Actions: `start`, `complete`, `updateGracePeriod`
  - `updateGracePeriod` broadcasts to host via WebSocket

- **Get Run**: `GET /api/runs/:runId`
  - Fetches current run state including active question

These endpoints use the same database tables as the WebSocket handlers, ensuring consistency.

---

## Example Flows

### Complete Run Flow
1. Admin creates run via `POST /api/events/:eventId/runs`
2. Host connects via WebSocket
3. Teams connect and select languages via `SELECT_LANGUAGE`
4. Host receives `TEAM_READY` for each team
5. Host sends `START_QUESTION` with first question
6. Teams receive `QUESTION_STARTED` in their language
7. Teams submit answers via `SUBMIT_ANSWER`
8. Host receives `ANSWER_RECEIVED` notifications
9. Host sends `PAUSE` to end question
10. Server grades answers automatically
11. Repeat steps 5-10 for each question
12. Host sends `COMPLETE_RUN`
13. Teams receive `RUN_COMPLETED` with scores
14. Connections close

### Team Reconnection Flow
1. Team's connection drops during active question
2. Team reconnects with same session
3. Server validates team and event
4. If question still active, server sends `YOUR_ANSWER` with existing answer
5. Team can continue editing and resubmit

### Grace Period Update Flow
1. Admin calls `PATCH /api/runs/:runId` with `updateGracePeriod`
2. Server updates database
3. Server updates cached run state
4. Server sends `GRACE_PERIOD_UPDATED` to host
5. New deadline applies to future answer submissions
