# Quick CORS Fix Deployment Script
# Deploys only the essential files to fix CORS issues

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"
$STAGING_DIR = "/var/www/ixasales/staging"

if ($Environment -ne "staging") {
    Write-Host "This script only supports staging environment" -ForegroundColor Red
    exit 1
}

$TARGET_DIR = $STAGING_DIR
$SERVICE_NAME = "ixasales-staging"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Quick CORS Fix Deployment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# 1. Upload built files
Write-Host "`n[1/4] Uploading built backend files..." -ForegroundColor Green
scp -r dist/* "${SERVER_USER}@${SERVER_IP}:${TARGET_DIR}/dist/"

# 2. Upload frontend build
Write-Host "`n[2/4] Uploading frontend build..." -ForegroundColor Green
scp -r client/dist/* "${SERVER_USER}@${SERVER_IP}:${TARGET_DIR}/client/dist/"

# 3. Update .env file with CORS configuration
Write-Host "`n[3/4] Updating CORS configuration..." -ForegroundColor Green
$corsCommand = "cd '$TARGET_DIR' && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz,https://dev-api.ixasales.uz|' .env && echo 'Updated CORS_ORIGIN'; else echo '' >> .env && echo 'CORS_ORIGIN=https://dev.ixasales.uz,https://dev-api.ixasales.uz' >> .env && echo 'Added CORS_ORIGIN'; fi; else echo 'Creating .env file' && echo 'CORS_ORIGIN=https://dev.ixasales.uz,https://dev-api.ixasales.uz' > .env; fi"
ssh "${SERVER_USER}@${SERVER_IP}" $corsCommand

# 4. Restart service
Write-Host "`n[4/4] Restarting service..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" -t "sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager"

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "Quick Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Staging URL: https://dev.ixasales.uz" -ForegroundColor Cyan
Write-Host "API URL: https://dev-api.ixasales.uz" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs: ssh `"${SERVER_USER}@${SERVER_IP}`" 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Yellow