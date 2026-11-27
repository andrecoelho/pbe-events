# PBE Events

## Development setup

Tool versions and dev tasks are managed with [mise](https://mise.jdx.dev) (see `mise.toml`).

```bash
curl https://mise.run | sh                       # single binary in ~/.local/bin, no dependencies
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc   # then open a new terminal
mise install                                     # installs the pinned Bun (and Node, for the Railway config)
cp .env.example .env                             # then adjust as needed
mise run db                                      # start local Postgres (Docker)
mise run dev                                     # install dependencies, apply migrations, start the dev server
```

Run `mise tasks` to list all tasks.

### Database migrations

The schema lives in `migrations/`, applied in name order and recorded in the `schema_migrations` table. To change it, add the next file (e.g. `migrations/0002_add_team_color.sql`); never edit one that has already run. Railway applies pending migrations before each deploy.

```bash
bun run migrate     # apply pending migrations to the database in POSTGRES_URL
bun run db:reset    # local only: delete everything and rebuild from migrations (asks first)
```

### Using the staging database

The staging Postgres has no public address. With the [Railway CLI](https://docs.railway.com/guides/cli) logged in and linked:

```bash
mise run dev:staging   # dev server against staging (opens and closes an SSH tunnel itself)
mise run db:tunnel     # just the tunnel on localhost:15432, for DB tools like Beekeeper
```

These only ever connect to **staging**, never production. Each tunnel stays open until you stop it (Ctrl+C) or close its terminal.

For production, `mise run db:tunnel:prod` opens a tunnel on localhost:15433, a different port so a saved connection can't point at the wrong database. It's for looking at data in a DB tool; nothing in the app or its scripts uses it.

`dev:staging` doesn't apply migrations, so a branch's unmerged migration never reaches staging's database; staging gets them when it deploys.

## Railway infrastructure

Railway deploys `staging` to the staging environment and `main` to production, each after GitHub CI passes. The services, database and volumes are described in [`.railway/railway.ts`](.railway/railway.ts); secrets stay in Railway. Changes to that file are not applied on deploy. Preview, then apply each environment by hand:

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

- [Questions Import/Export API](docs/QUESTIONS_IMPORT_API.md) - API documentation for importing and exporting questions
- [Questions Example YAML](docs/questions-example.yaml) - Sample YAML file for questions import
