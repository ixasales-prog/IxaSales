# =============================================================================
# Fix CORS Configuration on Server (PowerShell)
# Run from: Windows PowerShell
# Usage: .\scripts\fix-cors.ps1 staging
# =============================================================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"

if ($Environment -ne "staging" -and $Environment -ne "production") {
    Write-Host "Usage: .\fix-cors.ps1 [staging|production]" -ForegroundColor Red
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
Write-Host "Fixing CORS configuration for $Environment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target directory: $TARGET_DIR" -ForegroundColor Yellow
Write-Host "CORS Origin: $CORS_ORIGIN" -ForegroundColor Yellow
Write-Host ""

Write-Host "Connecting to server and updating CORS configuration..." -ForegroundColor Green

# Build commands as separate SSH calls to avoid escaping issues
$backupCmd = "cd $TARGET_DIR && cp .env .env.backup.`$(date +%Y%m%d_%H%M%S) && echo 'Backed up .env file'"
ssh "${SERVER_USER}@${SERVER_IP}" $backupCmd

# Update or add CORS_ORIGIN
$updateCmd = "cd $TARGET_DIR && if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS_ORIGIN|' .env && echo 'Updated existing CORS_ORIGIN'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=$CORS_ORIGIN' >> .env && echo 'Added CORS_ORIGIN'; fi"
ssh "${SERVER_USER}@${SERVER_IP}" $updateCmd

# Show current value
$showCmd = "cd $TARGET_DIR && echo 'Current CORS_ORIGIN value:' && grep '^CORS_ORIGIN=' .env || echo 'WARNING: CORS_ORIGIN not found'"
ssh "${SERVER_USER}@${SERVER_IP}" $showCmd

# Restart service
Write-Host ""
Write-Host "Restarting service..." -ForegroundColor Yellow
Write-Host "Note: You will be prompted for the sudo password (HelpMe11)" -ForegroundColor Yellow
$restartCmd = "echo 'HelpMe11' | sudo -S systemctl restart $SERVICE_NAME && sleep 2 && sudo systemctl status $SERVICE_NAME --no-pager | head -20"
ssh -tt "${SERVER_USER}@${SERVER_IP}" $restartCmd

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "CORS configuration updated!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "The service has been restarted with the new CORS settings." -ForegroundColor Cyan
Write-Host ""
Write-Host "To verify, check the service logs:" -ForegroundColor Yellow
Write-Host "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Gray
