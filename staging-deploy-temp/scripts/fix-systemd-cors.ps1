# =============================================================================
# Fix CORS by updating systemd service to load .env file
# This is the PERMANENT FIX for CORS issues after deployment
# 
# Run from: Windows PowerShell
# Usage: .\scripts\fix-systemd-cors.ps1 staging
# =============================================================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"

if ($Environment -ne "staging" -and $Environment -ne "production") {
    Write-Host "Usage: .\fix-systemd-cors.ps1 [staging|production]" -ForegroundColor Red
    exit 1
}

# Determine target directory and CORS origin
if ($Environment -eq "staging") {
    $TARGET_DIR = "/var/www/ixasales/staging"
    $CORS_ORIGIN = "https://dev.ixasales.uz"
    $SERVICE_NAME = "ixasales-staging"
    $PORT = 3001
    $API_URL = "https://dev-api.ixasales.uz"
} else {
    $TARGET_DIR = "/var/www/ixasales/production"
    $CORS_ORIGIN = "https://ixasales.uz"
    $SERVICE_NAME = "ixasales-production"
    $PORT = 3000
    $API_URL = "https://api.ixasales.uz"
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Fixing CORS: Systemd Service + .env Configuration" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Target directory: $TARGET_DIR" -ForegroundColor Yellow
Write-Host "CORS Origin: $CORS_ORIGIN" -ForegroundColor Yellow
Write-Host "Service: $SERVICE_NAME" -ForegroundColor Yellow
Write-Host ""

# Step 1: Create the new systemd service file content
$serviceFileContent = @"
[Unit]
Description=IxaSales $Environment Server
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
"@

Write-Host "[1/5] Updating systemd service file..." -ForegroundColor Green
$updateServiceCmd = "sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << 'EOF'
$serviceFileContent
EOF"
ssh "${SERVER_USER}@${SERVER_IP}" $updateServiceCmd
Write-Host "✓ Service file updated" -ForegroundColor Green

# Step 2: Ensure CORS_ORIGIN is in .env
Write-Host ""
Write-Host "[2/5] Ensuring CORS_ORIGIN in .env..." -ForegroundColor Green

$updateEnvCmd = @"
cd $TARGET_DIR && \
if [ -f .env ]; then \
  cp .env .env.backup.`$(date +%Y%m%d_%H%M%S) && echo '✓ Backed up .env' && \
  if grep -q '^CORS_ORIGIN=' .env; then \
    sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS_ORIGIN|' .env && echo '✓ Updated CORS_ORIGIN'; \
  else \
    echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=$CORS_ORIGIN' >> .env && echo '✓ Added CORS_ORIGIN'; \
  fi; \
else \
  echo '❌ ERROR: .env file not found'; exit 1; \
fi
"@
ssh "${SERVER_USER}@${SERVER_IP}" $updateEnvCmd

# Step 3: Verify .env configuration
Write-Host ""
Write-Host "[3/5] Verifying .env configuration..." -ForegroundColor Green

$verifyCmd = "cd $TARGET_DIR && echo 'CORS_ORIGIN:' && grep '^CORS_ORIGIN=' .env && echo '' && echo 'NODE_ENV:' && grep '^NODE_ENV=' .env"
ssh "${SERVER_USER}@${SERVER_IP}" $verifyCmd

# Step 4: Reload systemd and restart service
Write-Host ""
Write-Host "[4/5] Reloading systemd and restarting service..." -ForegroundColor Green

$restartCmd = "sudo systemctl daemon-reload && echo '✓ Daemon reloaded' && sudo systemctl restart $SERVICE_NAME && echo '✓ Service restarted' && sleep 3 && sudo systemctl status $SERVICE_NAME --no-pager | head -15"
ssh -t "${SERVER_USER}@${SERVER_IP}" $restartCmd

# Step 5: Test CORS
Write-Host ""
Write-Host "[5/5] Testing CORS configuration..." -ForegroundColor Green

Write-Host "Testing OPTIONS preflight..." -ForegroundColor Yellow
try {
    $headers = @{
        "Origin" = $CORS_ORIGIN
        "Access-Control-Request-Method" = "GET"
        "Access-Control-Request-Headers" = "Content-Type"
    }
    $response = Invoke-WebRequest -Uri "$API_URL/health" -Method OPTIONS -Headers $headers -UseBasicParsing
    $corsHeaders = $response.Headers | Where-Object { $_.Key -like "*Access-Control*" }
    if ($corsHeaders) {
        Write-Host "✓ CORS headers present:" -ForegroundColor Green
        $corsHeaders | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
    } else {
        Write-Host "⚠ No CORS headers in response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not test OPTIONS: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Testing health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health?debug=true" -Method GET
    Write-Host "Health: $($health | ConvertTo-Json -Compress)" -ForegroundColor Cyan
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "CORS Fix Complete!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "What was fixed:" -ForegroundColor Cyan
Write-Host "  1. Updated systemd service to use EnvironmentFile directive"
Write-Host "  2. Ensured CORS_ORIGIN=$CORS_ORIGIN in .env"
Write-Host "  3. Reloaded systemd daemon and restarted service"
Write-Host ""
Write-Host "The service now properly loads environment variables from .env"
Write-Host ""
Write-Host "To check logs:" -ForegroundColor Yellow
Write-Host "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -n 50 --no-pager'" -ForegroundColor Gray
Write-Host ""
Write-Host "To follow logs in real-time:" -ForegroundColor Yellow
Write-Host "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Gray
