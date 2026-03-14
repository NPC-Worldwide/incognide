###############################################################################
# Stage 1: Build the Vite frontend
###############################################################################
FROM node:20-slim AS frontend-builder

WORKDIR /app

COPY package.json ./

RUN npm install --ignore-scripts \
    && npm cache clean --force

COPY index.html vite.config.js tailwind.config.js tsconfig.json tsconfig.node.json ./
COPY src/ src/
COPY public/ public/

RUN npx vite build


###############################################################################
# Stage 2: Production image
###############################################################################
FROM node:20-slim AS production

LABEL maintainer="Chris Agostino <info@npcworldwi.de>"
LABEL description="Incognide web application"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libsqlite3-dev \
    libvips-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY package.json ./

RUN npm install --omit=dev --ignore-scripts \
    && npm cache clean --force

# Rebuild native modules for Linux container
RUN npm rebuild sqlite3 --build-from-source 2>/dev/null || true
RUN npm rebuild sharp 2>/dev/null || true

# Copy the built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist

# Copy backend source
COPY src/ src/
COPY assets/ assets/
COPY incognide_serve.py ./

# Create data directories
RUN mkdir -p /data /root/.npcsh/npc_team /root/.npcsh/incognide

ENV NODE_ENV=production
ENV PORT=3000
ENV BACKEND_PORT=5337
ENV FRONTEND_PORT=3000
ENV DATABASE_PATH=/data/npcsh_history.db
ENV NPCSH_BASE=/root/.npcsh
ENV PYTHONUNBUFFERED=1

EXPOSE 3000 5337

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Install runtime deps for web-server
RUN npm install express ws cors --save --ignore-scripts

# Inject web-preload.js into the built frontend index.html
RUN if [ -f /app/dist/index.html ]; then \
      sed -i 's|</head>|<script src="/web-preload.js"></script></head>|' /app/dist/index.html; \
    fi
# Copy web-preload.js to dist so it's served statically
RUN cp /app/src/web-preload.js /app/dist/web-preload.js

# Create workspace directory for user files
RUN mkdir -p /data/workspace

# Entrypoint: start web-server (serves frontend + API) and Python backend
RUN cat > /app/entrypoint.sh << 'ENTRYPOINT_EOF'
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
ENTRYPOINT_EOF

RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
