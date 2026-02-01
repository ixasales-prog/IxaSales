#!/bin/bash
# =============================================================================
# Check Service Status and Health
# Run from: Local machine (Git Bash/WSL) or Linux
# Usage: ./scripts/check-service.sh [staging|production]
# =============================================================================

set -e

# Configuration
SERVER_IP="176.96.241.152"
SERVER_USER="ilhom1983"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check environment argument
ENV=${1:-staging}

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
    echo -e "${RED}Usage: ./check-service.sh [staging|production]${NC}"
    exit 1
fi

# Determine service name and URLs
if [ "$ENV" = "staging" ]; then
    SERVICE_NAME="ixasales-staging"
    HEALTH_URL="https://dev-api.ixasales.uz/health"
    APP_URL="https://dev.ixasales.uz"
else
    SERVICE_NAME="ixasales-production"
    HEALTH_URL="https://api.ixasales.uz/health"
    APP_URL="https://ixasales.uz"
fi

echo "======================================"
echo "Checking service status for $ENV"
echo "======================================"
echo ""

# Check service status on server
echo "🔍 Checking service status..."
SERVICE_STATUS=$(ssh $SERVER_USER@$SERVER_IP "sudo systemctl is-active $SERVICE_NAME" 2>/dev/null || echo "error")
echo "Service $SERVICE_NAME: $SERVICE_STATUS"

if [ "$SERVICE_STATUS" = "active" ]; then
    echo -e "${GREEN}✓ Service is running${NC}"
else
    echo -e "${RED}✗ Service is not active${NC}"
    echo "Getting service status details..."
    ssh $SERVER_USER@$SERVER_IP "sudo systemctl status $SERVICE_NAME --no-pager" 2>/dev/null || echo "Could not get service status"
    echo ""
fi

# Check process status
echo "🔍 Checking process status..."
PROCESS_STATUS=$(ssh $SERVER_USER@$SERVER_IP "ps aux | grep -v grep | grep node | grep index-fastify" 2>/dev/null || echo "")
if [ -n "$PROCESS_STATUS" ]; then
    echo -e "${GREEN}✓ Node process is running${NC}"
    echo "$PROCESS_STATUS"
else
    echo -e "${YELLOW}⚠ Node process may not be running${NC}"
fi
echo ""

# Check ports
echo "🔍 Checking port binding..."
PORT_STATUS=$(ssh $SERVER_USER@$SERVER_IP "sudo netstat -tlnp | grep ':3001 '" 2>/dev/null || echo "")
if [ -n "$PORT_STATUS" ]; then
    echo -e "${GREEN}✓ Port 3001 is bound${NC}"
    echo "$PORT_STATUS"
else
    echo -e "${YELLOW}⚠ Port 3001 may not be bound${NC}"
fi
echo ""

# Check health endpoint
echo "🔍 Testing health endpoint..."
if command -v curl >/dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s -o /tmp/health_response.txt -w "%{http_code}" -m 10 "$HEALTH_URL" || echo "timeout")
    HTTP_CODE=$HEALTH_RESPONSE
    RESPONSE_FILE="/tmp/health_response.txt"
elif command -v wget >/dev/null 2>&1; then
    HTTP_CODE=$(wget --timeout=10 --tries=1 --server-response -O /tmp/health_response.txt "$HEALTH_URL" 2>&1 | awk '/^  HTTP/{print $2}' | tail -1)
    RESPONSE_FILE="/tmp/health_response.txt"
else
    echo -e "${RED}✗ Neither curl nor wget available for health check${NC}"
    exit 1
fi

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Health endpoint reachable (HTTP $HTTP_CODE)${NC}"
    if [ -f "$RESPONSE_FILE" ]; then
        HEALTH_DATA=$(cat "$RESPONSE_FILE" 2>/dev/null || echo "{}")
        if echo "$HEALTH_DATA" | grep -q '"status":"ok"'; then
            echo -e "${GREEN}✓ Health check passed${NC}"
        else
            echo -e "${YELLOW}⚠ Health endpoint returned: $HEALTH_DATA${NC}"
        fi
        rm -f "$RESPONSE_FILE"
    fi
else
    echo -e "${RED}✗ Health endpoint not reachable (HTTP $HTTP_CODE)${NC}"
    if [ -f "$RESPONSE_FILE" ]; then
        cat "$RESPONSE_FILE"
        rm -f "$RESPONSE_FILE"
    fi
fi
echo ""

# Check application logs
echo "🔍 Recent application logs:"
ssh $SERVER_USER@$SERVER_IP "journalctl -u $SERVICE_NAME --no-pager -n 15" 2>/dev/null || echo "Could not retrieve logs"

echo ""
echo "======================================"
echo -e "${GREEN}Service check complete${NC}"
echo "======================================"
echo ""
echo "App URL: $APP_URL"
echo "Health URL: $HEALTH_URL"
echo "Service: $SERVICE_NAME"
echo ""