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
# 1. Build Frontend Locally
# -----------------------------------------------------------------------------
echo -e "${GREEN}[1/5] Building frontend...${NC}"
cd client
npm install || bun install
npm run build
cd ..

# -----------------------------------------------------------------------------
# 2. Sync Files to Server
# -----------------------------------------------------------------------------
echo -e "${GREEN}[2/5] Syncing files to server...${NC}"

# Sync backend (excluding node_modules, uploads, .env)
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude '.env' \
    --exclude 'uploads/*' \
    --exclude '.git' \
    --exclude 'backups' \
    --exclude '/dist' \
    ./ $SERVER_USER@$SERVER_IP:$TARGET_DIR/

# -----------------------------------------------------------------------------
# 3. Install Dependencies on Server
# -----------------------------------------------------------------------------
echo -e "${GREEN}[3/5] Installing dependencies on server...${NC}"
ssh $SERVER_USER@$SERVER_IP << EOF
    cd $TARGET_DIR
    export PATH="\$HOME/.bun/bin:\$PATH"
    bun install --production
EOF

# -----------------------------------------------------------------------------
# 4. Run Database Migrations
# -----------------------------------------------------------------------------
echo -e "${GREEN}[4/5] Running database migrations...${NC}"
# Use -t to force PTY for interactive prompts (drizzle-kit push)
# ssh -t $SERVER_USER@$SERVER_IP "cd $TARGET_DIR && export PATH=\"\$HOME/.bun/bin:\$PATH\" && bun run db:push"
echo "Skipping migrations for stability..."

# -----------------------------------------------------------------------------
# 5. Fix Permissions & Restart Service
# -----------------------------------------------------------------------------
echo -e "${GREEN}[5/5] Fixing permissions & restarting service...${NC}"
echo -e "${GREEN}[5/5] Fixing permissions & restarting service...${NC}"
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
