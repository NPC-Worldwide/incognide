#!/bin/bash
set -e

echo "=== Incognide Web Server ==="
echo "Frontend:       http://0.0.0.0:${PORT:-3000}"
echo "==========================="

if [ -z "$WEB_ONLY" ]; then
  export INCOGNIDE_PORT="${BACKEND_PORT:-5337}"
  echo "Python Backend: http://0.0.0.0:${INCOGNIDE_PORT}"
  python3 /app/incognide_serve.py &
  BACKEND_PID=$!
fi

node /app/src/web-server.js &
FRONTEND_PID=$!

trap "kill $FRONTEND_PID ${BACKEND_PID:-} 2>/dev/null; exit 0" SIGTERM SIGINT

wait -n $FRONTEND_PID ${BACKEND_PID:-}
EXIT_CODE=$?
kill $FRONTEND_PID ${BACKEND_PID:-} 2>/dev/null
exit $EXIT_CODE
