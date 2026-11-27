# PBE Events

Runs Pathfinder Bible Experience quiz events: organizers write questions in several languages, a presenter screen shows them, teams answer from their own devices in real time, and judges grade. A single Bun server with a React frontend and Postgres, deployed on Railway.

## Development setup

Tool versions and dev tasks are managed with [mise](https://mise.jdx.dev) (see `mise.toml`).

```bash
curl https://mise.run | sh                       # single binary in ~/.local/bin, no dependencies
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc   # then open a new terminal
mise install                                     # installs the pinned Bun (and Node, for the Railway config)
cp .env.example .env                             # then adjust as needed
mise run db                                      # start local Postgres (needs Docker)
mise run dev                                     # install dependencies, apply migrations, start the dev server
```

Run `mise tasks` to list all tasks.

### Checks

CI runs these on every pull request and on pushes to `staging` and `main`:

```bash
bun run typecheck      # TypeScript
bun run lint           # oxlint (0 errors; warnings are known issues)
bun run format:check   # oxfmt; `bun run format` fixes it
bun test               # tests (*.test.ts)
```

### Database migrations

The schema lives in `migrations/`, applied in name order and recorded in the `schema_migrations` table. To change it, add the next file (e.g. `migrations/0002_add_team_color.sql`); never edit one that has already run. Railway applies pending migrations before each deploy.

```bash
bun run migrate     # apply pending migrations to the database in POSTGRES_URL
bun run db:reset    # local only: delete everything and rebuild from migrations (asks first)
bun run db:seed     # add (or refresh) a demo user and event locally
```

The demo event has English and Spanish, one question of each type, three teams and two slides. Sign in as `demo@example.com` / `demo-password` (local test values; see `scripts/seed.ts`). `db:reset` and `db:seed` refuse anything but a local database, including the staging and production tunnels; staging has its own task below, and production is never seeded.

### Using the staging database

The staging Postgres has no public address. With the [Railway CLI](https://docs.railway.com/guides/cli) logged in and linked:

```bash
mise run dev:staging   # dev server against staging (opens and closes an SSH tunnel itself)
mise run db:tunnel     # just the tunnel on localhost:15432, for DB tools like Beekeeper
mise run db:seed:staging   # add (or refresh) the demo user and event on staging
```

These only ever connect to **staging**, never production. Each tunnel stays open until you stop it (Ctrl+C) or close its terminal.

For production, `mise run db:tunnel:prod` opens a tunnel on localhost:15433, a different port so a saved connection can't point at the wrong database. It's for looking at data in a DB tool; nothing in the app or its scripts uses it.

On staging the demo password isn't in the repo, since the repo is public. Set `SEED_DEMO_PASSWORD` only for the run that first creates the demo user (`SEED_DEMO_PASSWORD=... mise run db:seed:staging`) and keep it in a password manager; later runs keep the existing password. The seed won't replace a real staging account that uses the demo email.

`dev:staging` doesn't apply migrations, so a branch's unmerged migration never reaches staging's database; staging gets them when it deploys.

## Railway infrastructure

Railway deploys `staging` to the staging environment (https://runpbe-staging.up.railway.app) and `main` to production, each after GitHub CI passes and after running pending migrations. The services, database and volumes are described in [`.railway/railway.ts`](.railway/railway.ts); secrets stay in Railway. Changes to that file are not applied on deploy. Preview, then apply each environment by hand:

```bash
railway config plan --environment staging
railway config apply --environment staging
```

Anything removed from the file can be deleted on apply, so read the plan first. Node (pinned in `mise.toml`) is only there to evaluate this file.

## Without mise

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

## Documentation

- [PBE 2027 plan](docs/PBE_2027_PLAN.md): the modernization plan, tracked on the "PBE 2027" GitHub project
- [Questions Import/Export API](docs/QUESTIONS_IMPORT_API.md) and [example YAML](docs/questions-example.yaml)
- [WebSocket architecture](docs/WEBSOCKET_ARCHITECTURE.md): how a live event runs
- [CLAUDE.md](CLAUDE.md): conventions for AI coding agents (Claude Code), with the [daisyUI reference](docs/daisyui.md) it uses for UI work
