#!/bin/bash
# =============================================================================
# Fix CORS Configuration on Server
# Run from: Local machine (Git Bash/WSL) or Linux
# Usage: ./scripts/fix-cors.sh staging
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
    echo -e "${RED}Usage: ./fix-cors.sh [staging|production]${NC}"
    exit 1
fi

# Determine target directory and CORS origin
if [ "$ENV" = "staging" ]; then
    TARGET_DIR="/var/www/ixasales/staging"
    CORS_ORIGIN="https://dev.ixasales.uz"
    SERVICE_NAME="ixasales-staging"
else
    TARGET_DIR="/var/www/ixasales/production"
    CORS_ORIGIN="https://ixasales.uz"
    SERVICE_NAME="ixasales-production"
fi

echo "======================================"
echo "Fixing CORS configuration for $ENV"
echo "======================================"
echo ""
echo "Target directory: $TARGET_DIR"
echo "CORS Origin: $CORS_ORIGIN"
echo ""

# Properly escape variables to prevent command injection
printf -v escaped_cors_origin '%q' "$CORS_ORIGIN"

# SSH into server and update .env file.
# IMPORTANT: Avoid heredocs here because they make ssh stdin non-interactive,
# which prevents sudo from prompting for a password (and you see "terminal is required").
#
# - `-tt` forces pseudo-tty allocation even if ssh thinks stdin isn't a TTY.
# - If your sudo requires a password, you'll be prompted normally.
ssh -tt $SERVER_USER@$SERVER_IP "bash -lc '
    set -e
    cd \"\$TARGET_DIR\"

    # Check if .env exists
    if [ ! -f .env ]; then
        echo \"ERROR: .env file not found at $TARGET_DIR/.env\"
        exit 1
    fi

    # Backup .env file
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
    echo \"✓ Backed up .env file\"

    # Update CORS_ORIGIN in .env file - using properly escaped variable
    if grep -q \"^CORS_ORIGIN=\" .env; then
        sed -i \"s|^CORS_ORIGIN=.*|CORS_ORIGIN=$escaped_cors_origin|\" .env
        echo \"✓ Updated existing CORS_ORIGIN\"
    else
        echo \"\" >> .env
        echo \"# CORS Configuration\" >> .env
        echo \"CORS_ORIGIN=$escaped_cors_origin\" >> .env
        echo \"✓ Added CORS_ORIGIN\"
    fi

    echo \"\"
    echo \"Current CORS_ORIGIN value:\"
    grep \"^CORS_ORIGIN=\" .env || echo \"WARNING: CORS_ORIGIN not found in .env\"

    echo \"\"
    echo \"Restarting service...\"
    sudo systemctl restart \"\$SERVICE_NAME\"
    sleep 2
    sudo systemctl status \"\$SERVICE_NAME\" --no-pager | head -20
'"

echo ""
echo "======================================"
echo -e "${GREEN}CORS configuration updated!${NC}"
echo "======================================"
echo ""
echo "The service has been restarted with the new CORS settings."
echo ""
echo "To verify, check the service logs:"
echo "ssh $SERVER_USER@$SERVER_IP 'journalctl -u $SERVICE_NAME -f'"
echo ""