#!/bin/bash
# Fix script to restart staging service with proper sudo handling

SERVER="ilhom1983@176.96.241.152"
SERVICE="ixasales-staging"

echo "======================================"
echo "Fixing Staging Service"
echo "======================================"

# Check if we can connect
ssh -o ConnectTimeout=5 $SERVER "echo 'Connection successful'" || {
    echo "❌ Cannot connect to server. Please check your SSH key setup."
    exit 1
}

# Try to restart the service
# Note: This will prompt for sudo password if not configured for passwordless sudo
echo ""
echo "Attempting to restart $SERVICE..."
echo "(You may be prompted for sudo password)"
echo ""

ssh -t $SERVER "sudo systemctl restart $SERVICE && sleep 3 && sudo systemctl status $SERVICE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Service restarted successfully"
    echo ""
    echo "Testing health endpoint..."
    sleep 2
    curl -s https://dev-api.ixasales.uz/health | head -20
else
    echo ""
    echo "❌ Failed to restart service"
    echo ""
    echo "Alternative: Run these commands manually on the server:"
    echo "  ssh $SERVER"
    echo "  sudo systemctl restart $SERVICE"
    echo "  sudo systemctl status $SERVICE"
fi
