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
    echo -e "${YELLOW}rsync not found; falling back to ZIP deployment...${NC}"
    
    # Create temp directory for staging files
    TEMP_DEPLOY_DIR="staging-deploy-temp"
    rm -rf "$TEMP_DEPLOY_DIR"
    mkdir -p "$TEMP_DEPLOY_DIR"
    
    # Copy only essential files to temp directory
    echo "Copying essential files to temp directory..."
    cp -r src "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp -r dist "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp -r drizzle "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp -r scripts "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp package.json "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp package-lock.json "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp drizzle.config.ts "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    cp tsconfig.json "$TEMP_DEPLOY_DIR/" 2>/dev/null || true
    
    # Copy client dist folder (built frontend)
    mkdir -p "$TEMP_DEPLOY_DIR/client"
    cp -r client/dist "$TEMP_DEPLOY_DIR/client/" 2>/dev/null || true
    cp client/package.json "$TEMP_DEPLOY_DIR/client/" 2>/dev/null || true
    
    # Create ZIP archive from temp directory using PowerShell
    echo "Creating deployment ZIP archive..."
    ZIP_FILE="staging-deploy.zip"
    rm -f "$ZIP_FILE"
    powershell -Command "Compress-Archive -Path '$TEMP_DEPLOY_DIR\*' -DestinationPath '$ZIP_FILE' -Force"
    
    # Prompt for sudo password early (for file extraction)
    echo "Sudo password is required for deployment..."
    read -s -p "Enter sudo password: " SUDO_PASSWORD
    echo ""
    
    # Transfer and extract on server
    echo "Transferring to server..."
    ssh $SERVER_USER@$SERVER_IP "mkdir -p $TARGET_DIR"
    scp "$ZIP_FILE" $SERVER_USER@$SERVER_IP:/tmp/
    # Use sudo to extract files with proper permissions
    ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S bash -c 'cd $TARGET_DIR && unzip -o /tmp/staging-deploy.zip && rm /tmp/staging-deploy.zip && chown -R www-data:www-data $TARGET_DIR'"
    
    # Cleanup
    rm -rf "$TEMP_DEPLOY_DIR"
    rm -f "$ZIP_FILE"
    echo -e "${GREEN}Files synced successfully!${NC}"
fi

# -----------------------------------------------------------------------------
# 4. Install Dependencies on Server
# -----------------------------------------------------------------------------
echo -e "${GREEN}[4/7] Installing dependencies on server...${NC}"
ssh $SERVER_USER@$SERVER_IP << EOF
    cd $TARGET_DIR
    npm install --omit=dev --include=optional
EOF

# -----------------------------------------------------------------------------
# 5. Configure CORS (Auto-fix CORS_ORIGIN in .env)
# -----------------------------------------------------------------------------
echo -e "${GREEN}[5/8] Configuring CORS...${NC}"
if [ "$ENV" = "staging" ]; then
    CORS_ORIGIN="https://dev.ixasales.uz"
else
    CORS_ORIGIN="https://ixasales.uz"
fi
ssh $SERVER_USER@$SERVER_IP "cd $TARGET_DIR && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS_ORIGIN|' .env && echo 'Updated CORS_ORIGIN to $CORS_ORIGIN'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=$CORS_ORIGIN' >> .env && echo 'Added CORS_ORIGIN=$CORS_ORIGIN'; fi; else echo '⚠ WARNING: .env file not found'; fi"

# -----------------------------------------------------------------------------
# 6. Run Database Migrations
# -----------------------------------------------------------------------------
echo -e "${GREEN}[6/8] Running database migrations...${NC}"
# Use -t to force PTY for interactive prompts (drizzle-kit push)
# ssh -t $SERVER_USER@$SERVER_IP "cd $TARGET_DIR && npm run db:push"
echo "Skipping migrations for stability..."

# -----------------------------------------------------------------------------
# 7. Verify Installation
# -----------------------------------------------------------------------------
echo -e "${GREEN}[7/8] Verifying installation...${NC}"
ssh $SERVER_USER@$SERVER_IP "cd $TARGET_DIR && test -f dist/index-fastify.js && echo '✓ Backend build found' || echo '⚠ WARNING: Backend build not found'"

# -----------------------------------------------------------------------------
# 8. Fix Permissions & Restart Service
# -----------------------------------------------------------------------------
echo -e "${GREEN}[8/8] Fixing permissions & restarting service...${NC}"

# Note: SUDO_PASSWORD was already prompted during file extraction step

# Fix ownership to www-data for nginx access and set proper permissions
ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S chown -R www-data:www-data $TARGET_DIR"
ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S chmod 755 $TARGET_DIR"
ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S chmod 755 $TARGET_DIR/client"
ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S chmod -R 755 $TARGET_DIR/client/dist"

# Determine port based on environment
if [ "$ENV" = "staging" ]; then
    PORT="3001"
else
    PORT="3000"
fi

# Kill any process using the port to prevent EADDRINUSE errors
ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S sh -c 'lsof -ti :$PORT | xargs -r kill -9 2>/dev/null; echo Port $PORT cleared'"

# Restart the service
ssh -t $SERVER_USER@$SERVER_IP "echo '$SUDO_PASSWORD' | sudo -S systemctl restart $SERVICE_NAME && echo '$SUDO_PASSWORD' | sudo -S systemctl status $SERVICE_NAME --no-pager"

echo ""
echo "======================================"
echo -e "${GREEN}Deployment Complete!${NC}"
echo "======================================"
echo ""
echo "Staging URL: https://dev.ixasales.uz"
echo "API URL: https://dev-api.ixasales.uz"
echo ""
echo "Check logs: ssh $SERVER_USER@$SERVER_IP 'journalctl -u $SERVICE_NAME -f'"
