#!/bin/sh
cd /app
exec /app/venv/bin/uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port "${CONTROLLER_PORT:-8080}"
