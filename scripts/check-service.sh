#!/bin/bash
# =============================================================================
# Check Service Status and Logs
# Usage: ./scripts/check-service.sh staging
# =============================================================================

ENV=${1:-staging}

if [ "$ENV" = "staging" ]; then
    SERVICE_NAME="ixasales-staging"
    TARGET_DIR="/var/www/ixasales/staging"
else
    SERVICE_NAME="ixasales-production"
    TARGET_DIR="/var/www/ixasales/production"
fi

SERVER_IP="176.96.241.152"
SERVER_USER="ilhom1983"

echo "======================================"
echo "Checking $SERVICE_NAME status"
echo "======================================"
echo ""

# Force TTY allocation so sudo can prompt for password if needed
ssh -tt $SERVER_USER@$SERVER_IP << EOF
    echo "=== Service Status ==="
    sudo systemctl status $SERVICE_NAME --no-pager | head -30
    echo ""
    echo "=== Recent Logs (last 50 lines) ==="
    sudo journalctl -u $SERVICE_NAME -n 50 --no-pager
    echo ""
    echo "=== Checking if process is running ==="
    ps aux | grep -i "node.*dist/index.js" | grep -v grep || echo "No Node.js process found"
    echo ""
    echo "=== Checking .env file ==="
    if [ -f $TARGET_DIR/.env ]; then
        echo "✓ .env file exists"
        grep "^CORS_ORIGIN=" $TARGET_DIR/.env || echo "⚠ CORS_ORIGIN not found"
        grep "^PORT=" $TARGET_DIR/.env || echo "⚠ PORT not found"
        grep "^NODE_ENV=" $TARGET_DIR/.env || echo "⚠ NODE_ENV not found"
    else
        echo "✗ .env file NOT found at $TARGET_DIR/.env"
    fi
    echo ""
    echo "=== Checking if port is listening ==="
    PORT=\$(grep "^PORT=" $TARGET_DIR/.env 2>/dev/null | cut -d'=' -f2 || echo "3000")
    echo "Expected port: \$PORT"
    sudo netstat -tlnp | grep ":\$PORT " || echo "⚠ Port \$PORT is not listening"
EOF

# NOTE:
# If you see "Pseudo-terminal will not be allocated..." and sudo can't prompt,
# run with: winpty ./scripts/check-service.sh staging

