#!/bin/bash
# =============================================================================
# IxaSales Deployment Script
# Run from: Local Windows (Git Bash/WSL) or Linux
# Usage: ./scripts/deploy.sh staging
# =============================================================================

set -e

# Configuration
SERVER_IP="176.96.241.152"
SERVER_USER="ilhom1983"
STAGING_DIR="/var/www/ixasales/staging"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check environment argument
ENV=${1:-staging}

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
    echo -e "${RED}Usage: ./deploy.sh [staging|production]${NC}"
    exit 1
fi

echo "======================================"
echo "Deploying IxaSales to $ENV"
echo "======================================"

# Determine target directory
if [ "$ENV" = "staging" ]; then
    TARGET_DIR=$STAGING_DIR
    SERVICE_NAME="ixasales-staging"
else
    TARGET_DIR="/var/www/ixasales/production"
    SERVICE_NAME="ixasales-production"
fi

# -----------------------------------------------------------------------------
# 1. Build Backend Locally
# -----------------------------------------------------------------------------
echo -e "${GREEN}[1/7] Building backend...${NC}"
npm install
npm run build

# -----------------------------------------------------------------------------
# 2. Build Frontend Locally
# -----------------------------------------------------------------------------
echo -e "${GREEN}[2/7] Building frontend...${NC}"
cd client
npm install
if [ "$ENV" = "staging" ]; then
    export VITE_API_URL="https://dev-api.ixasales.uz/api"
else
    export VITE_API_URL="https://api.ixasales.uz/api"
fi
echo -e "${YELLOW}Setting VITE_API_URL to $VITE_API_URL${NC}"
npm run build
cd ..

# -----------------------------------------------------------------------------
# 3. Sync Files to Server
# -----------------------------------------------------------------------------
echo -e "${GREEN}[3/7] Syncing files to server...${NC}"

# Sync backend (excluding node_modules, uploads, .env)
if command -v rsync >/dev/null 2>&1; then
    rsync -avz --progress \
        --exclude 'node_modules' \
        --exclude 'client/node_modules' \
        --exclude '.env' \
        --exclude 'uploads/*' \
        --exclude '.git' \
        --exclude 'backups' \
        ./ $SERVER_USER@$SERVER_IP:$TARGET_DIR/
else
    echo -e "${YELLOW}rsync not found; falling back to tar-over-ssh sync...${NC}"
    echo "node_modules" > .tar_excludes
    echo "client/node_modules" >> .tar_excludes
    echo ".env" >> .tar_excludes
    echo "uploads" >> .tar_excludes
    echo ".git" >> .tar_excludes
    echo "backups" >> .tar_excludes
    tar -czf - -X .tar_excludes . | ssh $SERVER_USER@$SERVER_IP "mkdir -p $TARGET_DIR && tar -xzf - -C $TARGET_DIR"
    rm .tar_excludes
fi

# -----------------------------------------------------------------------------
# 4. Install Dependencies on Server
# -----------------------------------------------------------------------------
echo -e "${GREEN}[4/7] Installing dependencies on server...${NC}"
ssh $SERVER_USER@$SERVER_IP << EOF
    cd $TARGET_DIR
    npm install --omit=dev
EOF

# -----------------------------------------------------------------------------
# 5. Run Database Migrations
# -----------------------------------------------------------------------------
echo -e "${GREEN}[5/7] Running database migrations...${NC}"
# Use -t to force PTY for interactive prompts (drizzle-kit push)
# ssh -t $SERVER_USER@$SERVER_IP "cd $TARGET_DIR && npm run db:push"
echo "Skipping migrations for stability..."

# -----------------------------------------------------------------------------
# 6. Verify Installation
# -----------------------------------------------------------------------------
echo -e "${GREEN}[6/7] Verifying installation...${NC}"
ssh $SERVER_USER@$SERVER_IP "cd $TARGET_DIR && test -f dist/index.js && echo '✓ Backend build found' || echo '⚠ WARNING: Backend build not found'"

# -----------------------------------------------------------------------------
# 7. Fix Permissions & Restart Service
# -----------------------------------------------------------------------------
echo -e "${GREEN}[7/7] Fixing permissions & restarting service...${NC}"
ssh -t $SERVER_USER@$SERVER_IP "sudo chmod 755 /var/www/ixasales && sudo chmod 755 $TARGET_DIR && sudo chmod 755 $TARGET_DIR/client && sudo chmod -R 755 $TARGET_DIR/client/dist && sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager"

echo ""
echo "======================================"
echo -e "${GREEN}Deployment Complete!${NC}"
echo "======================================"
echo ""
echo "Staging URL: https://dev.ixasales.uz"
echo "API URL: https://dev-api.ixasales.uz"
echo ""
echo "Check logs: ssh $SERVER_USER@$SERVER_IP 'journalctl -u $SERVICE_NAME -f'"
