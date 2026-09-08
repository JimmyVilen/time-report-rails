#!/usr/bin/env bash
# Runs a throwaway PostgreSQL cluster for the Playwright suite on machines
# without Docker. Data lives in .e2e/pg (git-ignored) and the server listens on
# E2E_PG_PORT (default 5434), so it never touches the docker-compose database.
#
#   scripts/e2e/local-postgres.sh start   # initdb on first use, then pg_ctl start
#   scripts/e2e/local-postgres.sh stop
#   scripts/e2e/local-postgres.sh status
set -euo pipefail

port="${E2E_PG_PORT:-5434}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
data="$root/.e2e/pg"
log="$root/.e2e/postgres.log"
user="timereport"
password="timereport"

find_bin() {
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  local candidate
  for candidate in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin /opt/homebrew/opt/postgresql@*/bin; do
    if [ -x "$candidate/pg_ctl" ]; then
      echo "$candidate"
      return
    fi
  done
  echo "pg_ctl not found; install PostgreSQL or use docker compose up -d db" >&2
  exit 1
}

bin="$(find_bin)"

# PostgreSQL refuses to run as root (common in CI containers): delegate to the
# unprivileged postgres user that the distribution package creates.
run() {
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

start() {
  mkdir -p "$root/.e2e"
  if [ ! -f "$data/PG_VERSION" ]; then
    local pwfile
    pwfile="$(mktemp)"
    printf '%s' "$password" > "$pwfile"
    mkdir -p "$data"
    if [ "$(id -u)" = "0" ]; then chown postgres "$root/.e2e" "$data" "$pwfile"; fi
    run "$bin/initdb" -D "$data" -U "$user" --pwfile="$pwfile" -A scram-sha-256 -E UTF8 >/dev/null
    rm -f "$pwfile"
  fi
  if run "$bin/pg_ctl" -D "$data" status >/dev/null 2>&1; then
    echo "postgres already running on port $port"
    return
  fi
  run "$bin/pg_ctl" -D "$data" -l "$log" -o "-p $port -k /tmp -c listen_addresses=127.0.0.1" -w start >/dev/null
  echo "postgres started on port $port (data: $data)"
}

case "${1:-start}" in
  start) start ;;
  stop) run "$bin/pg_ctl" -D "$data" -m fast -w stop ;;
  status) run "$bin/pg_ctl" -D "$data" status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
