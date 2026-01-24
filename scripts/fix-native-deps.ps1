# =============================================================================
# Fix Native Dependencies on Server (PowerShell)
# Run from: Windows PowerShell
# Usage: .\scripts\fix-native-deps.ps1 staging
# =============================================================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"

if ($Environment -ne "staging" -and $Environment -ne "production") {
    Write-Host "Usage: .\fix-native-deps.ps1 [staging|production]" -ForegroundColor Red
    exit 1
}

# Determine target directory
if ($Environment -eq "staging") {
    $TARGET_DIR = "/var/www/ixasales/staging"
    $SERVICE_NAME = "ixasales-staging"
} else {
    $TARGET_DIR = "/var/www/ixasales/production"
    $SERVICE_NAME = "ixasales-production"
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Fixing native dependencies for $Environment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target directory: $TARGET_DIR" -ForegroundColor Yellow
Write-Host ""

Write-Host "Connecting to server and rebuilding native dependencies..." -ForegroundColor Green

# Step 1: Remove node_modules to force clean reinstall
Write-Host "`n[1/4] Removing node_modules..." -ForegroundColor Yellow
$removeCmd = "cd $TARGET_DIR && rm -rf node_modules"
ssh "${SERVER_USER}@${SERVER_IP}" $removeCmd

# Step 2: Clean npm cache (optional but helps)
Write-Host "`n[2/4] Cleaning npm cache..." -ForegroundColor Yellow
$cleanCmd = "npm cache clean --force"
ssh "${SERVER_USER}@${SERVER_IP}" $cleanCmd

# Step 3: Reinstall dependencies (this will rebuild native bindings)
Write-Host "`n[3/4] Reinstalling dependencies (this may take a few minutes)..." -ForegroundColor Yellow
$installCmd = "cd $TARGET_DIR && npm install --omit=dev"
ssh "${SERVER_USER}@${SERVER_IP}" $installCmd

# Step 4: Verify argon2 native binding
Write-Host "`n[4/4] Verifying native bindings..." -ForegroundColor Yellow
$verifyCmd = "cd $TARGET_DIR && ls -la node_modules/@node-rs/argon2-linux-x64-gnu 2>/dev/null && echo 'Native binding found' || echo 'WARNING: Native binding not found'"
ssh "${SERVER_USER}@${SERVER_IP}" $verifyCmd

# Step 5: Restart service
Write-Host "`nRestarting service..." -ForegroundColor Yellow
$restartCmd = "echo 'HelpMe11' | sudo -S systemctl restart $SERVICE_NAME && sleep 2 && sudo systemctl status $SERVICE_NAME --no-pager | head -20"
ssh -tt "${SERVER_USER}@${SERVER_IP}" $restartCmd

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Native dependencies rebuilt!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "The service has been restarted with rebuilt native dependencies." -ForegroundColor Cyan
Write-Host ""
Write-Host "To verify, check the service logs:" -ForegroundColor Yellow
Write-Host "ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Gray
