#!/bin/bash
set -e

echo "=== Incognide Backend ==="
echo "Backend: http://0.0.0.0:${BACKEND_PORT:-5337}"
echo "==========================="

export INCOGNIDE_PORT="${BACKEND_PORT:-5337}"
python3 /app/incognide_serve.py &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null; exit 0" SIGTERM SIGINT

wait -n $BACKEND_PID
EXIT_CODE=$?
kill $BACKEND_PID 2>/dev/null
exit $EXIT_CODE
