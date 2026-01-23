#!/bin/bash
# =============================================================================
# IxaSales Server Setup Script
# Run on: Ubuntu 22.04 VPS (176.96.241.152)
# Usage: chmod +x server-setup.sh && sudo ./server-setup.sh
# =============================================================================

set -e  # Exit on any error

echo "======================================"
echo "IxaSales Staging Server Setup"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_USER="ilhom1983"
APP_DIR="/var/www/ixasales/staging"
DOMAIN_API="dev-api.ixasales.uz"
DOMAIN_APP="dev.ixasales.uz"
DB_NAME="ixasales_staging"
DB_USER="ixasales"
DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
JWT_SECRET=$(openssl rand -hex 32)
STAGING_PORT=3001

echo -e "${YELLOW}Generated credentials (SAVE THESE!):${NC}"
echo "Database Password: $DB_PASS"
echo "JWT Secret: $JWT_SECRET"
echo ""

# -----------------------------------------------------------------------------
# 1. System Updates
# -----------------------------------------------------------------------------
echo -e "${GREEN}[1/8] Updating system...${NC}"
apt update && apt upgrade -y

# -----------------------------------------------------------------------------
# 2. Install Node.js
# -----------------------------------------------------------------------------
echo -e "${GREEN}[2/8] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "Node.js already installed"
fi

# -----------------------------------------------------------------------------
# 3. Install PostgreSQL
# -----------------------------------------------------------------------------
echo -e "${GREEN}[3/8] Installing PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    apt install postgresql postgresql-contrib -y
    systemctl start postgresql
    systemctl enable postgresql
else
    echo "PostgreSQL already installed"
fi

# Create database and user
sudo -u postgres psql << EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
    END IF;
END
\$\$;

DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo -e "${GREEN}Database '$DB_NAME' created with user '$DB_USER'${NC}"

# -----------------------------------------------------------------------------
# 4. Install Redis (for rate limiting)
# -----------------------------------------------------------------------------
echo -e "${GREEN}[4/8] Installing Redis...${NC}"
if ! command -v redis-server &> /dev/null; then
    apt install redis-server -y
    systemctl enable redis-server
    systemctl start redis-server
else
    echo "Redis already installed"
fi

# -----------------------------------------------------------------------------
# 5. Create Application Directories
# -----------------------------------------------------------------------------
echo -e "${GREEN}[5/8] Creating application directories...${NC}"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/uploads
chown -R $APP_USER:www-data $APP_DIR
chmod -R 775 $APP_DIR

# -----------------------------------------------------------------------------
# 6. Create systemd Service
# -----------------------------------------------------------------------------
echo -e "${GREEN}[6/8] Creating systemd service...${NC}"
cat > /etc/systemd/system/ixasales-staging.service << EOF
[Unit]
Description=IxaSales Staging Server
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=$APP_USER
Group=www-data
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "Service created (will be enabled after first deployment)"

# -----------------------------------------------------------------------------
# 7. Configure Nginx
# -----------------------------------------------------------------------------
echo -e "${GREEN}[7/8] Configuring Nginx...${NC}"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    apt install nginx -y
fi

cat > /etc/nginx/sites-available/ixasales-staging << EOF
# IxaSales Staging - API Backend
server {
    listen 80;
    server_name $DOMAIN_API;

    location / {
        proxy_pass http://localhost:$STAGING_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 50M;
    }
}

# IxaSales Staging - Frontend
server {
    listen 80;
    server_name $DOMAIN_APP;

    root $APP_DIR/client/dist;
    index index.html;

    # SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service worker - no cache
    location /sw.js {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Manifest
    location /manifest.json {
        expires -1;
        add_header Cache-Control "no-store";
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/ixasales-staging /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# -----------------------------------------------------------------------------
# 8. Create Environment File Template
# -----------------------------------------------------------------------------
echo -e "${GREEN}[8/8] Creating environment file...${NC}"
cat > $APP_DIR/.env << EOF
# Database
DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME

# Authentication
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# App Configuration
PORT=$STAGING_PORT
NODE_ENV=production
API_URL=https://$DOMAIN_API
CORS_ORIGIN=https://$DOMAIN_APP

# Redis
REDIS_URL=redis://localhost:6379

# Telegram (configure from admin UI)
TELEGRAM_ENABLED=false
EOF

chown $APP_USER:www-data $APP_DIR/.env
chmod 600 $APP_DIR/.env

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "======================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Point DNS records to this server:"
echo "   - $DOMAIN_API -> 176.96.241.152"
echo "   - $DOMAIN_APP -> 176.96.241.152"
echo ""
echo "2. Deploy code from your local machine:"
echo "   ./scripts/deploy.sh staging"
echo ""
echo "3. After deployment, get SSL certificates:"
echo "   sudo certbot --nginx -d $DOMAIN_APP -d $DOMAIN_API"
echo ""
echo -e "${YELLOW}SAVE THESE CREDENTIALS:${NC}"
echo "Database: $DB_NAME"
echo "DB User: $DB_USER"
echo "DB Password: $DB_PASS"
echo "JWT Secret: $JWT_SECRET"
echo ""
