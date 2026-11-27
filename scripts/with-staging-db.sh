#!/usr/bin/env bash
# Runs a command with POSTGRES_URL pointing at the STAGING database through a Railway tunnel on localhost:15432.
# Opens the tunnel if it isn't already open, and closes it again when the command exits.
# Usage: scripts/with-staging-db.sh <command...>   (always staging, never production)
set -euo pipefail
port=15432

if ! nc -z localhost "$port" 2>/dev/null; then
  # Its output includes the database password, so it goes to a private temp file, shown only on failure.
  log=$(mktemp)
  railway connect postgres --environment staging --tunnel-only --port "$port" >"$log" 2>&1 </dev/null &
  tunnel=$!
  disown "$tunnel" # no "Terminated" message when it is stopped at the end
  # railway starts an ssh child; stop both (and remove the log) when the command exits.
  trap 'pkill -P "$tunnel" 2>/dev/null; kill "$tunnel" 2>/dev/null; rm -f "$log"' EXIT
  echo "Opening tunnel to staging Postgres on localhost:$port..."
  for _ in $(seq 1 120); do nc -z localhost "$port" 2>/dev/null && break; sleep 0.5; done
  if ! nc -z localhost "$port" 2>/dev/null; then
    echo "Tunnel did not open:" >&2
    grep -iv 'password\|postgresql://' "$log" >&2 || true
    exit 1
  fi
fi

# Build the URL from staging's Postgres variables without printing it.
url=$(railway variables --environment staging --service postgres --json \
  | bun -e "const v = await Bun.stdin.json(); console.log('postgres://' + encodeURIComponent(v.PGUSER) + ':' + encodeURIComponent(v.PGPASSWORD) + '@localhost:$port/' + v.PGDATABASE)")

POSTGRES_URL="$url" "$@"
