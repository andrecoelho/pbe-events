#!/usr/bin/env bash
# Runs the smoke tests against this checkout and against another git ref (default origin/staging), on the
# local database, and diffs the transcripts. Use it to check a server change keeps the API and the live
# run behaving as before. Local only: scripts/seed.ts refuses any other database.
#
# Usage: scripts/smoke/compare.sh [ref]     (bun run smoke [ref]); SMOKE_PORT picks the port (default 3456).
set -euo pipefail

ref="${1:-origin/staging}"
root="$(git rev-parse --show-toplevel)"
out="$(mktemp -d)"
base="$out/base"
port="${SMOKE_PORT:-3456}"

cleanup() {
  [[ -n "${pid:-}" ]] && kill "$pid" 2>/dev/null || true
  git -C "$root" worktree remove --force "$base" 2>/dev/null || true
}
trap cleanup EXIT

git -C "$root" worktree add -q --detach "$base" "$ref"
ln -s "$root/node_modules" "$base/node_modules"
cp "$root/.env" "$base/.env"
mkdir -p "$base/data"

run() {
  local label="$1" dir="$2"
  (cd "$root" && bun scripts/seed.ts >/dev/null)
  (cd "$dir" && PORT=$port exec bun src/server/index.ts) >"$out/$label-server.log" 2>&1 &
  pid=$!

  for _ in $(seq 1 50); do
    curl -sf "http://localhost:$port/api/health" >/dev/null && break
    sleep 0.2
  done

  local part
  for part in run writes; do
    if ! bun "$root/scripts/smoke/$part.ts" "http://localhost:$port" >"$out/$label-$part.txt" 2>&1; then
      echo "The $part smoke test failed against $label. Its output and the end of the server log:"
      tail -n 15 "$out/$label-$part.txt"
      tail -n 15 "$out/$label-server.log"
      exit 2
    fi
  done
  kill "$pid"
  wait "$pid" 2>/dev/null || true
  pid=
}

echo "Running against $ref…"
run base "$base"
echo "Running against this checkout…"
run current "$root"

status=0
for part in run writes; do
  if diff -u "$out/base-$part.txt" "$out/current-$part.txt" >"$out/$part.diff"; then
    echo "$part: no differences"
  else
    echo "$part: differences ($out/$part.diff)"
    cat "$out/$part.diff"
    status=1
  fi
done

grep -il 'error' "$out"/*-server.log >/dev/null && echo "Server logs with errors are in $out" || true
exit $status
