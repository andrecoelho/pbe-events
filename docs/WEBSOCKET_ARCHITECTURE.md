# Live Run WebSocket

How an event is run live: the host steps through the event on the Run screen, the presenter screen shows it, teams answer from their own devices, and judges grade. Everything goes through one WebSocket endpoint served by the same Bun process as the API.

- Server: `src/server/webSocket.ts` (`WebSocketServer`), message schemas in `src/server/webSocketMessages.ts`.
- Shared message types: `src/types.ts` (`ServerMessage`, `AckMessage`, `TeamClientMessage`, `HostClientMessage`, `JudgeClientMessage`, `PresenterClientMessage`). Compile-time checks in `webSocketMessages.ts` keep the schemas and the types in step, and the server sends only through `encode(message: ServerMessage | AckMessage)`.
- Client: `src/frontend/components/WebSocketManager.ts`, used by each page's valt (`runValt`, `gradeValt`, `presenterValt`, `teamValt`).

## Connecting

Every role connects to `/event-run/ws` with a `role` query parameter.

| Role                     | URL                         | Who may connect                            | Topics it's subscribed to                    |
| ------------------------ | --------------------------- | ------------------------------------------ | -------------------------------------------- |
| host (Run screen)        | `?role=host&eventId=…`      | signed in, `owner` or `admin` of the event | `{eventId}:hosts`                            |
| presenter                | `?role=presenter&eventId=…` | signed in, `owner` or `admin`              | `{eventId}:presenters`                       |
| judge (Grade screen)     | `?role=judge&eventId=…`     | signed in, any role on the event           | `{eventId}:judges`                           |
| results (Results screen) | `?role=results&eventId=…`   | signed in, `owner` or `admin`              | `{eventId}:results`                          |
| team                     | `?role=team`                | the device that joined the team (#44)      | `{eventId}:teams`, `{eventId}:team:{teamId}` |

- Hosts, presenters and judges are checked against their session cookie. Several of each may be connected at once.
- Teams are identified by the `teamToken` cookie the device got when it joined with the team's code (`/join/K7P4QX` or typing it at `/join`, which posts to `POST /api/join`). The server finds the team, and so the event, from that token; the database keeps only its SHA-256. A second device trying the same code gets 409 "Team N is already connected on another device. Ask the host to release it."
- A refused connection still upgrades, then gets `CONNECTION_ERROR` with a message (and `code: 'NOT_JOINED'` for a team page without a valid token, which then goes to `/join`).

What each role gets when it connects:

- host: `ACTIVE_ITEM`, `TEAM_STATUS` (every team)
- presenter and judge: `LANGUAGES`, `RUN_STATUS`, `ACTIVE_ITEM`
- results: nothing until totals may change
- team: `EVENT_INFO`, `TEAM_INFO`, `LANGUAGES`, `RUN_STATUS`, `ACTIVE_ITEM`, `GRACE_PERIOD`; hosts get a `TEAM_STATUS` for the team

The event's live state (`EventConnection`: run status, grace period, the active item, languages, connected teams) is set up from the database by the first connection, shared by connections that arrive together (#52), and dropped when nobody is connected. An event without languages connects (it can't have teams); one missing its run record is refused with that reason.

## Messages from pages

Each page message carries `__ACK__` (added by `WebSocketManager`). Each role's messages are validated by its Zod schema; anything else is refused.

| Role  | Message                                       | What happens                                                                                                                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all   | `PING`                                        | Nothing; used for clock sync. The results role sends nothing else.                                                                                                                                                                                                                                                                                              |
| team  | `SUBMIT_ANSWER { answer, questionId? }`       | Saves the team's answer to the open question (an upsert, so a newer answer replaces the older one and clears its grading). Refused unless the question is in the prompt phase, not locked, within its time and grace period, and (when `questionId` is given) still the open question. True/false answers may be booleans; they're saved as `'true'`/`'false'`. |
| team  | `SUBMIT_CHALLENGE { questionId, challenged }` | Sets or clears the team's challenge while the question's answer is shown.                                                                                                                                                                                                                                                                                       |
| host  | `UPDATE_RUN_STATUS { status }`                | `not_started`, `in_progress`, `paused`, `completed`. Back to `not_started` erases every answer and unlocks every question. Pausing and resuming pause and resume the timer.                                                                                                                                                                                     |
| host  | `UPDATE_GRACE_PERIOD { gracePeriod }`         | 0–600 seconds; moves a running question's time-up.                                                                                                                                                                                                                                                                                                              |
| host  | `SET_ACTIVE_ITEM { activeItem }`              | Puts an item on screen: `null`, the title, a slide, or a question in its `reading`, `prompt` or `answer` phase. Opening a prompt starts its timer; going from a question's answer to the next question's reading locks the previous question. The page's `answers` are ignored (see Answers).                                                                   |
| host  | `SET_QUESTION_LOCKED { questionId, locked }`  | Locks or unlocks a question for answers (grading needs it locked).                                                                                                                                                                                                                                                                                              |
| host  | `START_TIMER` / `REMOVE_TIMER`                | Restarts the open question's full time / removes its time limit.                                                                                                                                                                                                                                                                                                |
| host  | `RELEASE_TEAM_DEVICE { teamId }`              | Frees the team for another device; the device that held it gets `CONNECTION_ERROR` code `RELEASED` and is disconnected.                                                                                                                                                                                                                                         |
| host  | `RENEW_JOIN_CODE { teamId }`                  | A new join code for the team; the old code and link stop working, a joined device stays.                                                                                                                                                                                                                                                                        |
| judge | `UPDATE_POINTS { answerId, points }`          | Sets or clears (`null`) an answer's points.                                                                                                                                                                                                                                                                                                                     |
| judge | `SET_QUESTION_GRADED { questionId, graded }`  | Marks a question graded or not.                                                                                                                                                                                                                                                                                                                                 |

Every write is scoped to the socket's event: an answer or question id from another event is refused and changes nothing (#43).

## Messages from the server

| Message                                                | Sent to                   | When                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACK { id, serverTime, ok, error? }`                   | the sender                | after each message is handled (see Order and ACKs)                                                                                                                        |
| `CONNECTION_ERROR { message, code? }`                  | the socket                | a refused connection; a team device released by the host                                                                                                                  |
| `ERROR { code: 'INVALID_MESSAGE', message }`           | the sender                | a frame that isn't JSON or doesn't match its schema                                                                                                                       |
| `EVENT_INFO`, `TEAM_INFO`                              | the team                  | when it connects                                                                                                                                                          |
| `RUN_STATUS { status }`                                | everyone                  | on connect (not hosts) and when the host changes it                                                                                                                       |
| `GRACE_PERIOD { gracePeriod }`                         | everyone                  | on connect (teams) and when the host changes it                                                                                                                           |
| `LANGUAGES { languages }`                              | presenters, judges, teams | on connect                                                                                                                                                                |
| `ACTIVE_ITEM { activeItem }`                           | everyone                  | on connect and whenever it changes; every 5 s while a timer runs. Teams get only their own answer in `answers`.                                                           |
| `TEAM_STATUS { teams }`                                | hosts                     | on connect (every team) and on changes (only the changed fields): connection status, join code, device                                                                    |
| `QUESTION_LOCKED`, `QUESTION_GRADED`, `POINTS_UPDATED` | hosts, presenters, judges | after the change                                                                                                                                                          |
| `RESULTS_CHANGED`                                      | results screens           | team totals may have changed: points given, a new answer (which clears its points), a run started over; the screen reloads `GET /api/events/:id/results`, debounced (#27) |

## Order and ACKs (#53)

The server handles an event's messages one at a time, in the order they arrive; timer events go through the same queue. So back-to-back messages can't overtake each other.

Each message is answered after its database writes with `{ type: 'ACK', id, serverTime, ok: true }` or `{ ok: false, error }`, where `error` is a sentence for the person ("Time is up: your answer wasn't saved."). `WebSocketManager.sendMessage` resolves with `{ ok, error }`, and the pages show the error in a toast. With no ACK within 2 seconds the client reconnects and resolves `ok: false` (or keeps a team's answer queued, see Reconnection). A handler that throws is logged and its ACK says `ok: false`.

## Answers (#54)

The `answers` table is the only place answers are stored. The active item's `answers` (one entry per team) is a copy kept in memory: the server builds it from the table when a question opens (ignoring the copy the host page sends), when an event's live state loads, and when a run starts over. Submitting, challenging and grading write the table first, then update the copy. `runs.active_item` is saved without answers, and `GET /api/events/:id/run` adds them back from the table.

## Timer (#47)

The server keeps one deadline per open question and broadcasts it only when it changes; every page counts down on its own.

1. **Clock sync.** Every ACK carries `serverTime`. On connect, `WebSocketManager` sends 5 `PING`s one at a time and keeps the offset from the fastest round trip: `offset = serverTime − (sent + received) / 2` (`src/frontend/utils/serverClock.ts`). It re-syncs every minute, when the tab is shown again and when the network comes back.
2. **Deadline.** Opening a question for answers, or `START_TIMER`, sets the prompt item's `endsAt` (server time, ms) to now + `seconds`. Pages show `ceil((endsAt − serverNow) / 1000)`. `REMOVE_TIMER` clears it (no time limit, shown as `∞`).
3. **Time up.** A server timeout at `endsAt` + grace period sets `isTimeUp` and broadcasts it. Team pages close their inputs at that same instant on their own, and the server refuses answers after it (it checks the deadline itself too).
4. **Pause.** Pausing the run keeps the time left in `pausedMs` (and clears `endsAt`); resuming sets a new `endsAt`, so every page resumes together.
5. **Writes.** The run's `active_item` is saved when the timer starts, pauses, resumes or times up, not every second. After a server restart an open question keeps its deadline.

## Reconnection (#49, #50, #30)

1. A dropped connection (a deploy, a Wi-Fi drop) is retried forever: 1 s, 2 s, 4 s … up to 30 s between attempts, each shortened at random by up to half so a room of devices doesn't reconnect at once. Pages show "Reconnecting…"; the team page adds that answers will be sent once the connection is back.
2. A team's answers go through an outbox (`sendMessage(message, { queueKey })`): one that can't be sent, or whose ACK never comes, waits and is resent after reconnecting until the server answers. Only the latest answer per question is kept, and the server refuses one whose question has closed.
3. The same device opening the team in a second tab replaces the first tab's socket, which the server closes with code 4003 (`TEAM_REPLACED_CLOSE_CODE`). That tab stops reconnecting and shows "This team is open in another tab" with a **Use this tab** button.

## Team connection status (#48)

`TEAM_STATUS` gives each team's `status` and `lastSeenAt` (server time, ms; null if not seen since the server started): `connected`; `reconnecting` for 2 minutes after its socket drops (its page keeps retrying); then `offline`. A released device goes `offline` at once. The Run screen colors the badges (amber, pulsing, for reconnecting) and each team's menu says "Connected", "Reconnecting, last seen 20 s ago" or "Offline since 10:42". Last-seen times live in the server's memory, so a restart forgets them.

## Sessions and security

- When a host, judge or presenter session logs out, the server closes its sockets at once with code 4001 (`SESSION_ENDED_CLOSE_CODE`), and it checks every minute for sessions that expired or were deleted (#45). Pages reload on 4001, which shows the login page.
- Every frame is parsed with its role's schema (#46); frames over 1 MB (`MAX_MESSAGE_BYTES`) close the socket with code 1009.
- Join attempts (`POST /api/join`) are rate limited to 60 a minute per address. Codes are six characters from an alphabet without look-alikes (about 887 million values).

## Close codes

| Code  | Meaning                    | Client                       |
| ----- | -------------------------- | ---------------------------- |
| 1009  | Frame too large            | reconnects                   |
| 4001  | Session ended              | reloads (login page)         |
| 4003  | Team opened in another tab | stops, offers "Use this tab" |
| other | Connection dropped         | reconnects with backoff      |
