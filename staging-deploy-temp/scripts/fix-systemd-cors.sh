#!/bin/bash
# =============================================================================
# Fix CORS by updating systemd service to load .env file
# This is the PERMANENT FIX for CORS issues after deployment
# 
# Run from: Local machine (Git Bash/WSL)
# Usage: ./scripts/fix-systemd-cors.sh staging
# =============================================================================

set -e

# Configuration
SERVER_IP="176.96.241.152"
SERVER_USER="ilhom1983"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Check environment argument
ENV=${1:-staging}

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
    echo -e "${RED}Usage: ./fix-systemd-cors.sh [staging|production]${NC}"
    exit 1
fi

# Determine target directory and CORS origin
if [ "$ENV" = "staging" ]; then
    TARGET_DIR="/var/www/ixasales/staging"
    CORS_ORIGIN="https://dev.ixasales.uz"
    SERVICE_NAME="ixasales-staging"
    PORT=3001
else
    TARGET_DIR="/var/www/ixasales/production"
    CORS_ORIGIN="https://ixasales.uz"
    SERVICE_NAME="ixasales-production"
    PORT=3000
fi

echo "======================================================"
echo -e "${CYAN}Fixing CORS: Systemd Service + .env Configuration${NC}"
echo "======================================================"
echo ""
echo "Environment: $ENV"
echo "Target directory: $TARGET_DIR"
echo "CORS Origin: $CORS_ORIGIN"
echo "Service: $SERVICE_NAME"
echo ""

# Step 1: Update systemd service file to include EnvironmentFile
echo -e "${GREEN}[1/5] Updating systemd service file...${NC}"

ssh -t $SERVER_USER@$SERVER_IP "
    echo 'Creating updated systemd service file...'
    
    sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << 'SERVICEEOF'
[Unit]
Description=IxaSales $ENV Server
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=$SERVER_USER
Group=www-data
WorkingDirectory=$TARGET_DIR
# CRITICAL: Load environment from .env file (contains DATABASE_URL, CORS_ORIGIN, JWT_SECRET, etc.)
EnvironmentFile=$TARGET_DIR/.env
# Override with explicit settings
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=/usr/bin/node dist/index-fastify.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICEEOF
    
    echo '✓ Service file updated'
"

# Step 2: Ensure CORS_ORIGIN is in .env
echo ""
echo -e "${GREEN}[2/5] Ensuring CORS_ORIGIN in .env...${NC}"

ssh $SERVER_USER@$SERVER_IP "
    cd $TARGET_DIR
    
    if [ ! -f .env ]; then
        echo '❌ ERROR: .env file not found at $TARGET_DIR/.env'
        exit 1
    fi
    
    # Backup .env
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
    echo '✓ Backed up .env file'
    
    # Update or add CORS_ORIGIN
    if grep -q '^CORS_ORIGIN=' .env; then
        sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS_ORIGIN|' .env
        echo '✓ Updated existing CORS_ORIGIN'
    else
        echo '' >> .env
        echo '# CORS Configuration' >> .env
        echo 'CORS_ORIGIN=$CORS_ORIGIN' >> .env
        echo '✓ Added CORS_ORIGIN'
    fi
    
    # Ensure NODE_ENV is set to production
    if ! grep -q '^NODE_ENV=' .env; then
        echo 'NODE_ENV=production' >> .env
        echo '✓ Added NODE_ENV=production'
    fi
"

# Step 3: Show current .env CORS config
echo ""
echo -e "${GREEN}[3/5] Verifying .env configuration...${NC}"

ssh $SERVER_USER@$SERVER_IP "
    cd $TARGET_DIR
    echo 'CORS_ORIGIN value in .env:'
    grep '^CORS_ORIGIN=' .env || echo '❌ NOT FOUND'
    echo ''
    echo 'NODE_ENV value in .env:'
    grep '^NODE_ENV=' .env || echo '❌ NOT FOUND'
"

# Step 4: Reload systemd and restart service
echo ""
echo -e "${GREEN}[4/5] Reloading systemd and restarting service...${NC}"

ssh -t $SERVER_USER@$SERVER_IP "
    sudo systemctl daemon-reload
    echo '✓ Systemd daemon reloaded'
    
    sudo systemctl restart $SERVICE_NAME
    echo '✓ Service restarted'
    
    sleep 3
    
    echo ''
    echo 'Service status:'
    sudo systemctl status $SERVICE_NAME --no-pager | head -20
"

# Step 5: Verify CORS is working
echo ""
echo -e "${GREEN}[5/5] Testing CORS configuration...${NC}"

echo "Testing preflight OPTIONS request..."
CORS_HEADERS=$(curl -sS -I -X OPTIONS \
    -H "Origin: $CORS_ORIGIN" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: Content-Type" \
    "$([ "$ENV" = "staging" ] && echo "https://dev-api.ixasales.uz" || echo "https://api.ixasales.uz")/health" 2>&1)

echo "$CORS_HEADERS" | grep -i "access-control" || echo -e "${YELLOW}⚠ No CORS headers found - server may still be starting${NC}"

echo ""
echo "Testing health endpoint with debug info..."
if [ "$ENV" = "staging" ]; then
    curl -sS "https://dev-api.ixasales.uz/health?debug=true" | head -5 || echo "Health check failed"
else
    curl -sS "https://api.ixasales.uz/health?debug=true" | head -5 || echo "Health check failed"
fi

echo ""
echo "======================================================"
echo -e "${GREEN}CORS Fix Complete!${NC}"
echo "======================================================"
echo ""
echo "What was fixed:"
echo "  1. Updated systemd service to use EnvironmentFile directive"
echo "  2. Ensured CORS_ORIGIN=$CORS_ORIGIN in .env"
echo "  3. Reloaded systemd daemon and restarted service"
echo ""
echo "The service now properly loads environment variables from .env"
echo ""
echo "To check logs:"
echo -e "${YELLOW}ssh $SERVER_USER@$SERVER_IP 'journalctl -u $SERVICE_NAME -n 50 --no-pager'${NC}"
echo ""
echo "To follow logs in real-time:"
echo -e "${YELLOW}ssh $SERVER_USER@$SERVER_IP 'journalctl -u $SERVICE_NAME -f'${NC}"
