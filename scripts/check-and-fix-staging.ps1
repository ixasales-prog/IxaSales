# =============================================================================
# Check and Fix Staging Service (PowerShell)
# Run from: Windows PowerShell
# Usage: .\scripts\check-and-fix-staging.ps1
# =============================================================================

$ErrorActionPreference = "Continue"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"
$TARGET_DIR = "/var/www/ixasales/staging"
$SERVICE_NAME = "ixasales-staging"
$CORS_ORIGIN = "https://dev.ixasales.uz"
$SUDO_PASSWORD = "HelpMe11"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Staging Service Diagnostic & Fix" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check service status
Write-Host "[1/6] Checking service status..." -ForegroundColor Green
$statusOutput = ssh "${SERVER_USER}@${SERVER_IP}" "sudo systemctl status $SERVICE_NAME --no-pager 2>&1 | head -20"
Write-Host $statusOutput

# Step 2: Check recent logs for errors
Write-Host "`n[2/6] Checking recent service logs (last 30 lines)..." -ForegroundColor Green
$logsOutput = ssh "${SERVER_USER}@${SERVER_IP}" "journalctl -u $SERVICE_NAME -n 30 --no-pager 2>&1"
Write-Host $logsOutput

# Step 3: Verify .env file exists
Write-Host "`n[3/6] Checking .env file..." -ForegroundColor Green
$envCheck = ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && if [ -f .env ]; then echo '✓ .env file exists'; grep CORS_ORIGIN .env || echo 'CORS_ORIGIN not found'; else echo 'ERROR: .env file not found'; fi"
Write-Host $envCheck

# Step 4: Fix CORS_ORIGIN
Write-Host "`n[4/6] Fixing CORS_ORIGIN..." -ForegroundColor Green
$fixCorsCmd = "cd $TARGET_DIR && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS_ORIGIN|' .env && echo 'Updated CORS_ORIGIN'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=$CORS_ORIGIN' >> .env && echo 'Added CORS_ORIGIN'; fi; grep '^CORS_ORIGIN=' .env; else echo 'ERROR: .env file not found'; fi"
$fixCors = ssh "${SERVER_USER}@${SERVER_IP}" $fixCorsCmd
Write-Host $fixCors

# Step 5: Check if dist folder exists
Write-Host "`n[5/6] Checking build files..." -ForegroundColor Green
$buildCheck = ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && echo 'Backend build:' && (test -f dist/index-fastify.js && echo '✓ dist/index-fastify.js exists' || echo '✗ dist/index-fastify.js NOT FOUND') && echo 'Frontend build:' && (test -d client/dist && echo '✓ client/dist exists' || echo '✗ client/dist NOT FOUND')"
Write-Host $buildCheck

# Step 6: Restart service
Write-Host "`n[6/6] Restarting service..." -ForegroundColor Green
Write-Host "This may take a moment..." -ForegroundColor Yellow
$restartOutput = ssh "${SERVER_USER}@${SERVER_IP}" "echo '$SUDO_PASSWORD' | sudo -S systemctl restart $SERVICE_NAME 2>&1 && sleep 3 && sudo systemctl status $SERVICE_NAME --no-pager 2>&1 | head -15"
Write-Host $restartOutput

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Diagnostic Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "If the service is still not working, check logs:" -ForegroundColor Yellow
$logCmd = "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -n 100 --no-pager'"
Write-Host $logCmd -ForegroundColor Gray
Write-Host ""
Write-Host "Test the API:" -ForegroundColor Yellow
Write-Host "curl https://dev-api.ixasales.uz/api/health" -ForegroundColor Gray
