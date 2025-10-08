#!/bin/bash

# Environment Validation Script for Socket.IO Server
# Validates required environment variables and connectivity

set -e

echo "🔍 Validating Socket.IO environment configuration..."

# Check SOCKET_SERVER_URL
if [ -z "$SOCKET_SERVER_URL" ]; then
  echo "❌ ERROR: SOCKET_SERVER_URL not set"
  echo "   Please set SOCKET_SERVER_URL environment variable"
  echo "   Example: export SOCKET_SERVER_URL=http://localhost:3010"
  exit 1
fi
echo "✓ SOCKET_SERVER_URL: $SOCKET_SERVER_URL"

# Check NEXT_PUBLIC_WS_URL
if [ -z "$NEXT_PUBLIC_WS_URL" ]; then
  echo "⚠️  WARNING: NEXT_PUBLIC_WS_URL not set"
  echo "   Client WebSocket connections may fail"
  echo "   Example: export NEXT_PUBLIC_WS_URL=http://localhost:3010"
else
  echo "✓ NEXT_PUBLIC_WS_URL: $NEXT_PUBLIC_WS_URL"
fi

# Check NEXT_PUBLIC_APP_URL (required for CORS)
if [ -z "$NEXT_PUBLIC_APP_URL" ]; then
  echo "⚠️  WARNING: NEXT_PUBLIC_APP_URL not set"
  echo "   CORS may block Socket.IO connections in production"
  echo "   Example: export NEXT_PUBLIC_APP_URL=http://localhost:3000"
else
  echo "✓ NEXT_PUBLIC_APP_URL: $NEXT_PUBLIC_APP_URL"
fi

# Test connectivity to Socket.IO server
echo ""
echo "🔌 Testing Socket.IO server connectivity..."

# Try health endpoint first
if curl -f -s -o /dev/null -w "%{http_code}" "$SOCKET_SERVER_URL/health" > /dev/null 2>&1; then
  echo "✓ Socket server health check passed"
elif curl -f -s -o /dev/null -w "%{http_code}" "$SOCKET_SERVER_URL" > /dev/null 2>&1; then
  echo "✓ Socket server reachable (no /health endpoint, but server responds)"
else
  echo "❌ ERROR: Socket server not reachable at $SOCKET_SERVER_URL"
  echo "   Please ensure Socket.IO server is running"
  echo "   Try: cd server && node index.js"
  exit 1
fi

echo ""
echo "✅ Socket environment validation complete"
exit 0
