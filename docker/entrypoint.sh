#!/bin/sh
set -e

MONGO_PID=""
APP_PID=""

cleanup() {
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi

  if [ -n "$MONGO_PID" ]; then
    kill "$MONGO_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

MONGO_LOG_PATH="/tmp/mongod.log"

mongod --dbpath /data/db --port 27017 --bind_ip 127.0.0.1 --quiet --logpath "$MONGO_LOG_PATH" --logappend &
MONGO_PID=$!

if command -v mongosh >/dev/null 2>&1; then
  i=0
  until mongosh --host 127.0.0.1 --port 27017 --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "MongoDB did not become ready in time" >&2
      if [ -f "$MONGO_LOG_PATH" ]; then
        echo "--- mongod log (tail) ---" >&2
        tail -n 200 "$MONGO_LOG_PATH" >&2 || true
        echo "--- end mongod log ---" >&2
      fi
      exit 1
    fi
    sleep 1
  done
else
  sleep 2
fi

cd /usr/src/app

npm install --no-audit --no-fund

npm run dev &
APP_PID=$!

wait "$APP_PID"
