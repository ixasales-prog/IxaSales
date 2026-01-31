#!/bin/bash
# =============================================================================
# Fix Server Permissions for IxaSales Deployment
# Run this ONCE on the server to fix permission issues permanently
# Usage: ssh ilhom1983@176.96.241.152 'bash -s' < scripts/fix-deploy-permissions.sh
# Or run: ssh ilhom1983@176.96.241.152 "sudo bash -c 'chown -R ilhom1983:ilhom1983 /var/www/ixasales && chmod -R 775 /var/www/ixasales'"
# =============================================================================

# Configuration
STAGING_DIR="/var/www/ixasales/staging"
PRODUCTION_DIR="/var/www/ixasales/production"
USER="ilhom1983"

echo "======================================"
echo "Fixing IxaSales Deployment Permissions"
echo "======================================"

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Please run this script with sudo:"
    echo "   sudo bash fix-deploy-permissions.sh"
    exit 1
fi

# Create directories if they don't exist
mkdir -p $STAGING_DIR
mkdir -p $PRODUCTION_DIR

# Fix ownership - make your user the owner so you can deploy
chown -R $USER:$USER $STAGING_DIR
chown -R $USER:$USER $PRODUCTION_DIR

# Set permissions - owner has full access, group can read/write, others can read
chmod -R 775 $STAGING_DIR
chmod -R 775 $PRODUCTION_DIR

# Ensure the directories are accessible
chmod 755 /var/www/ixasales

echo "✅ Permissions fixed!"
echo ""
echo "Staging directory: $STAGING_DIR"
echo "Production directory: $PRODUCTION_DIR"
echo ""
echo "Ownership set to: $USER:$USER"
echo "Permissions set to: 775 (rwxrwxr-x)"
echo ""
echo "You should now be able to deploy without permission errors."
