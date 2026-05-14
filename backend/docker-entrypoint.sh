#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ -n "${MUFFON_PID:-}" ]]; then
    kill "${MUFFON_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

export MUFFON_RAILS_ENV="${MUFFON_RAILS_ENV:-development}"
export MUFFON_PORT="${MUFFON_PORT:-4000}"
export MUFFON_DATABASE_URL="${MUFFON_DATABASE_URL:-postgresql://postgres:password@postgres:5432/muffon_api}"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"
export MUFFON_API_URL="${MUFFON_API_URL:-http://127.0.0.1:${MUFFON_PORT}/api}"

cd /app/muffon-api
rm -f tmp/pids/server.pid
RAILS_ENV="${MUFFON_RAILS_ENV}" bin/rails db:prepare
RAILS_ENV="${MUFFON_RAILS_ENV}" PORT="${MUFFON_PORT}" bin/rails server -b 127.0.0.1 &
MUFFON_PID="$!"

cd /app
npx prisma migrate deploy
exec npm run start
