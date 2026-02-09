#!/bin/sh
set -e

API_PID=""
WORKER_PID=""

cleanup() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi

  if [ -n "$WORKER_PID" ]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

tsx watch api.ts &
API_PID=$!

tsx watch worker.ts &
WORKER_PID=$!

wait
