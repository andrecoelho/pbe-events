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
