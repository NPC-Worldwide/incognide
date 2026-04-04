#!/bin/bash
set -e

echo "=== Incognide Web Server ==="
echo "Frontend + API: http://0.0.0.0:${PORT:-3000}"
echo "Python Backend: http://0.0.0.0:${BACKEND_PORT:-5337}"
echo "Workspace:      /data/workspace"
echo "Database:       ${DATABASE_PATH:-/data/npcsh_history.db}"
echo "==========================="

export INCOGNIDE_PORT="${BACKEND_PORT:-5337}"
python3 /app/incognide_serve.py &
BACKEND_PID=$!

node /app/src/web-server.js &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGTERM SIGINT

wait -n $BACKEND_PID $FRONTEND_PID
EXIT_CODE=$?
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
exit $EXIT_CODE
