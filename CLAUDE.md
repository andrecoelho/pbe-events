# PBE Events

Runs Pathfinder Bible Experience quiz events: organizers write questions in several languages, a presenter screen shows them, teams answer from their own devices in real time, and judges grade. One Bun process serves the API, the WebSocket and the React pages.

## Commands

```bash
mise run dev           # bun install, apply migrations, dev server with hot reload (local Postgres)
mise run dev:staging   # dev server against the staging database through a Railway tunnel
bun run typecheck      # tsc (TypeScript 7)
bun run lint           # oxlint; must have 0 errors (warnings are known issues)
bun run format         # oxfmt; `format:check` is what CI runs
bun test               # bun:test, files named *.test.ts next to the code
bun run migrate        # apply pending migrations to POSTGRES_URL
bun run db:reset       # local only: rebuild the database from migrations (asks first)
bun run db:seed        # local only: demo@example.com / demo-password owning "Demo Event"
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check and tests. Run them before pushing.

## Stack

- Bun 1.4 (pinned in `mise.toml`; Node is there only to evaluate `.railway/railway.ts`)
- Server: `Bun.serve` routes, Postgres through `import { sql } from 'bun'`
- Frontend: React 19, Valtio, Tailwind CSS 4 + daisyUI 5, bundled by Bun from the HTML entry points
- Formatting and linting: oxfmt and oxlint (single quotes, 120 columns, no trailing commas)

## Layout

- `src/server/index.ts`: the server. Spreads each `src/server/routes/*.ts` object into `Bun.serve({ routes })`; `fetch` handles the WebSocket upgrade, `/user-image/*`, and sends pages to the login, app, team or presenter bundle.
- `src/server/routes/*.ts`: API routes, `export const fooRoutes: Routes = { '/api/foo/:id': { GET, POST, ... } }`. Type params with `BunRequest<'/api/foo/:id'>`.
- `src/server/webSocket.ts`: running an event live (host, presenter, team and judge connections). See `docs/WEBSOCKET_ARCHITECTURE.md`.
- `src/server/utils/responses.ts`: response helpers. `apiData(obj)` returns JSON with keys converted to camelCase; errors use `apiBadRequest`, `apiUnauthorized`, `apiForbidden`, `apiNotFound`, `apiServerError`, which return `{ error: message }`.
- `src/server/queries.ts`: shared permission-checked queries such as `querySelectEvent(eventId, userId)`.
- `src/frontend/{app,login,team,presenter}/`: one HTML entry point each. The organizer app routes with `useRouter` (a `Map` of path regex to page) in `src/frontend/app/App.tsx`; pages live in `src/frontend/app/pages/<feature>/`.
- `src/types.ts`: types shared by server and frontend, such as `ActiveItem`.
- `migrations/`: the schema. `scripts/`: dev database scripts. `.railway/railway.ts`: Railway infrastructure.

## Conventions

- Import from `src/` with the `@/` alias, including assets (`@/assets/...`).
- Queries are tagged templates: `` await sql`SELECT ... WHERE id = ${id}` `` (values are parameters, never string concatenation). Use `sql.begin(async (tx) => ...)` for transactions. Rows come back snake_case; `apiData` camelCases them.
- Check the session in every API route: `const session = await getSession(req); if (!session) return apiUnauthorized();`, then check the user's role on the event (`permissions.role_id` is `owner`, `admin` or `judge`).
- IDs are `Bun.randomUUIDv7()` strings. Passwords use `Bun.password.hash` / `Bun.password.verify`.
- Frontend state: each feature has a Valt class holding a Valtio `proxy` store, created with `useMemo(init, [])`, provided through a React context (`useFooValt()`), and read with `useSnapshot(valt.store)`. Methods mutate the store directly.
- UI is daisyUI 5 components on Tailwind 4. Before writing or changing UI, read `docs/daisyui.md` (the daisyUI reference for agents).
- Question types: `PG` points general, `PS` points specific, `TF` true/false, `FB` fill in the blank (blanks are 2+ underscores in the prompt; multi-blank answers are joined with `' | '`).

## Database

- To change the schema, add the next file in `migrations/` (e.g. `0002_add_team_color.sql`). Never edit a migration that has already run. Each file runs in a transaction and is recorded in `schema_migrations`.
- Railway runs `bun run migrate` before every deploy; a failing migration stops the deploy.
- `db:reset` and `db:seed` refuse anything but a local database, including the Railway tunnels (staging on localhost:15432, production on localhost:15433). `mise run db:seed:staging` seeds staging; it keeps the demo user's existing password (`SEED_DEMO_PASSWORD` is only needed to create it).

## Environments and deploys

- Railway deploys the `staging` branch to staging (https://runpbe-staging.up.railway.app) and `main` to production, each only after CI passes. Work reaches production by merging `staging` into `main`.
- `.railway/railway.ts` describes the Railway project. It is not applied on deploy: preview with `railway config plan --environment <env>` and apply by hand. Anything removed from the file can be deleted on apply. Apply a change to production only once `main` has the code it depends on.
- Secrets live in Railway variables and in the git-ignored `.env`; never commit them. The repo is public.
- `GET /api/health` (checks the database) is Railway's deploy health check.

## Docs

- `docs/PBE_2027_PLAN.md`: the modernization plan; each item is a GitHub issue on the "PBE 2027" project.
- `docs/QUESTIONS_IMPORT_API.md` and `docs/questions-example.yaml`: question import/export format.
- `docs/WEBSOCKET_ARCHITECTURE.md`: the live event protocol.
