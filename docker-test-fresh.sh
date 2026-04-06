#!/bin/bash
# Test incognide fresh install experience in Docker
set -e

echo "=== Incognide Fresh Install Test ==="
echo ""

# Build the image
echo "1. Building Docker image..."
docker build -t incognide-fresh-test . 2>&1 | tail -3

# Test: container starts and health check passes
echo ""
echo "2. Starting container..."
docker run -d --name incognide-test-fresh -p 3333:3000 incognide-fresh-test
sleep 8

echo "3. Testing frontend health..."
HEALTH=$(curl -sf http://localhost:3333/health 2>&1)
echo "   $HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "   OK: frontend healthy"
else
    echo "   FAIL: frontend not healthy"
fi

# Test: backend health (through frontend proxy)
echo ""
echo "4. Testing backend health..."
BACKEND=$(docker exec incognide-test-fresh curl -sf http://localhost:5337/api/health 2>&1)
echo "   $BACKEND"
if echo "$BACKEND" | grep -q '"status":"ok"'; then
    echo "   OK: backend healthy"
else
    echo "   FAIL: backend not healthy"
fi

# Test: settings endpoint works
echo ""
echo "5. Testing settings API..."
SETTINGS=$(docker exec incognide-test-fresh curl -sf http://localhost:5337/api/settings/global 2>&1)
if echo "$SETTINGS" | grep -q 'global_settings'; then
    echo "   OK: settings API responds"
else
    echo "   FAIL: settings API broken"
fi

# Test: models endpoint works
echo ""
echo "6. Testing models API..."
MODELS=$(docker exec incognide-test-fresh curl -sf "http://localhost:5337/api/models?currentPath=~" 2>&1)
if echo "$MODELS" | grep -q 'models'; then
    echo "   OK: models API responds"
else
    echo "   FAIL: models API broken"
fi

# Test: NPC team deployed
echo ""
echo "7. Testing NPC team deployment..."
NPC_COUNT=$(docker exec incognide-test-fresh ls /root/.npcsh/incognide/npc_team/ 2>&1 | wc -l)
echo "   NPC team files: $NPC_COUNT"

# Test: frontend serves UI
echo ""
echo "8. Testing frontend serves HTML..."
HTML=$(curl -sf http://localhost:3333/ 2>&1 | head -1)
if echo "$HTML" | grep -q "html\|<!DOCTYPE"; then
    echo "   OK: frontend serves HTML"
else
    echo "   FAIL: frontend not serving HTML"
fi

# Cleanup
echo ""
echo "9. Cleaning up..."
docker stop incognide-test-fresh && docker rm incognide-test-fresh
echo ""
echo "=== All tests complete ==="
