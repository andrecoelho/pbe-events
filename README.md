# PBE Events

## Development setup

Tool versions and dev tasks are managed with [mise](https://mise.jdx.dev) (see `mise.toml`).

```bash
curl https://mise.run | sh                       # single binary in ~/.local/bin, no dependencies
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc   # then open a new terminal
mise install                                     # installs the pinned Bun
cp .env.example .env                             # then adjust as needed
mise run db                                      # start local Postgres (Docker)
mise run dev                                     # install dependencies and start the dev server
```

Run `mise tasks` to list all tasks.

### Using the staging database

The staging Postgres has no public address. With the [Railway CLI](https://docs.railway.com/guides/cli) logged in and linked:

```bash
mise run dev:staging   # dev server against staging (opens and closes an SSH tunnel itself)
mise run db:tunnel     # just the tunnel on localhost:15432, for DB tools like TablePlus
```

These only ever connect to **staging**, never production.

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
