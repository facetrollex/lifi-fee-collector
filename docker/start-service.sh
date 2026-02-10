#!/bin/sh
set -e

SERVICE_ROLE="${1:-api}"
APP_ENV="${APP_ENV:-development}"
DEV_MULTIPLE_WORKERS="${DEV_MULTIPLE_WORKERS:-false}"

run_development() {
  case "$SERVICE_ROLE" in
    api)
      exec npm run dev:api
      ;;
    worker)
      if [ "$DEV_MULTIPLE_WORKERS" = "true" ]; then
        npm run dev:worker &
        WORKER_1_PID=$!
        npm run dev:worker &
        WORKER_2_PID=$!

        cleanup() {
          kill "$WORKER_1_PID" "$WORKER_2_PID" 2>/dev/null || true
        }

        trap cleanup INT TERM EXIT
        wait "$WORKER_1_PID" "$WORKER_2_PID"
        exit $?
      fi

      exec npm run dev:worker
      ;;
    *)
      echo "Unsupported service role: $SERVICE_ROLE" >&2
      exit 1
      ;;
  esac
}

run_production() {
  npm run build

  case "$SERVICE_ROLE" in
    api)
      exec npm run start:api
      ;;
    worker)
      exec npm run start:worker
      ;;
    *)
      echo "Unsupported service role: $SERVICE_ROLE" >&2
      exit 1
      ;;
  esac
}

cd /usr/src/app
npm install --no-audit --no-fund

if [ "$APP_ENV" = "development" ]; then
  run_development
else
  run_production
fi
