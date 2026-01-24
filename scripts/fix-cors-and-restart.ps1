# =============================================================================
# Fix CORS and Restart Service (PowerShell)
# Run from: Windows PowerShell
# Usage: .\scripts\fix-cors-and-restart.ps1 staging
# =============================================================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"
$SUDO_PASSWORD = "HelpMe11"

if ($Environment -ne "staging" -and $Environment -ne "production") {
    Write-Host "Usage: .\fix-cors-and-restart.ps1 [staging|production]" -ForegroundColor Red
    exit 1
}

# Determine target directory and CORS origin
if ($Environment -eq "staging") {
    $TARGET_DIR = "/var/www/ixasales/staging"
    $CORS_ORIGIN = "https://dev.ixasales.uz"
    $SERVICE_NAME = "ixasales-staging"
} else {
    $TARGET_DIR = "/var/www/ixasales/production"
    $CORS_ORIGIN = "https://ixasales.uz"
    $SERVICE_NAME = "ixasales-production"
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Fixing CORS and Restarting Service" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Target directory: $TARGET_DIR" -ForegroundColor Yellow
Write-Host "CORS Origin: $CORS_ORIGIN" -ForegroundColor Yellow
Write-Host "Service: $SERVICE_NAME" -ForegroundColor Yellow
Write-Host ""

# Step 1: Check service status
Write-Host "[1/5] Checking service status..." -ForegroundColor Green
$statusCmd = "sudo systemctl status $SERVICE_NAME --no-pager | head -15"
ssh "${SERVER_USER}@${SERVER_IP}" $statusCmd

# Step 2: Backup .env
Write-Host "`n[2/5] Backing up .env file..." -ForegroundColor Green
$backupCmd = "cd $TARGET_DIR && if [ -f .env ]; then cp .env .env.backup.`$(date +%Y%m%d_%H%M%S) && echo 'Backed up .env'; else echo 'WARNING: .env file not found'; fi"
ssh "${SERVER_USER}@${SERVER_IP}" $backupCmd

# Step 3: Update CORS_ORIGIN
Write-Host "`n[3/5] Updating CORS_ORIGIN..." -ForegroundColor Green
$updateCmd = "cd $TARGET_DIR && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS_ORIGIN|' .env && echo 'Updated CORS_ORIGIN to $CORS_ORIGIN'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=$CORS_ORIGIN' >> .env && echo 'Added CORS_ORIGIN=$CORS_ORIGIN'; fi; else echo 'ERROR: .env file not found'; exit 1; fi"
ssh "${SERVER_USER}@${SERVER_IP}" $updateCmd

# Step 4: Verify CORS_ORIGIN
Write-Host "`n[4/5] Verifying CORS_ORIGIN..." -ForegroundColor Green
$verifyCmd = "cd $TARGET_DIR && echo 'Current CORS_ORIGIN:' && grep '^CORS_ORIGIN=' .env || echo 'ERROR: CORS_ORIGIN not found in .env'"
ssh "${SERVER_USER}@${SERVER_IP}" $verifyCmd

# Step 5: Restart service
Write-Host "`n[5/5] Restarting service..." -ForegroundColor Green
Write-Host "Using sudo password..." -ForegroundColor Yellow
$restartCmd = "echo '$SUDO_PASSWORD' | sudo -S systemctl restart $SERVICE_NAME && sleep 3 && sudo systemctl status $SERVICE_NAME --no-pager | head -20"
ssh -tt "${SERVER_USER}@${SERVER_IP}" $restartCmd

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "CORS Fixed and Service Restarted!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Check service logs:" -ForegroundColor Yellow
Write-Host "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -n 50 --no-pager'" -ForegroundColor Gray
Write-Host ""
Write-Host "Follow logs in real-time:" -ForegroundColor Yellow
Write-Host "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Gray
