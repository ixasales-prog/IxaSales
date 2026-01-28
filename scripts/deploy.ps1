# =============================================================================
# IxaSales Deployment Script (PowerShell)
# Run from: Windows PowerShell
# Usage: .\scripts\deploy.ps1 staging
# =============================================================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"
$STAGING_DIR = "/var/www/ixasales/staging"

if ($Environment -ne "staging" -and $Environment -ne "production") {
    Write-Host "Usage: .\deploy.ps1 [staging|production]" -ForegroundColor Red
    exit 1
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Deploying IxaSales to $Environment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

if ($Environment -eq "staging") {
    $TARGET_DIR = $STAGING_DIR
    $SERVICE_NAME = "ixasales-staging"
} else {
    $TARGET_DIR = "/var/www/ixasales/production"
    $SERVICE_NAME = "ixasales-production"
}

# -----------------------------------------------------------------------------
# 1. Create Remote Backup
# -----------------------------------------------------------------------------
Write-Host "`n[1/10] Creating remote backup..." -ForegroundColor Green
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupCmd = "cd '$TARGET_DIR' && mkdir -p backups && tar -czf 'backups/deployment_backup_$timestamp.tar.gz' --exclude='node_modules' --exclude='uploads' --exclude='client/node_modules' . 2>/dev/null || echo 'No existing files to backup'"
ssh "${SERVER_USER}@${SERVER_IP}" $backupCmd

# -----------------------------------------------------------------------------
# 2. Build Backend Locally
# -----------------------------------------------------------------------------
Write-Host "`n[2/10] Building backend..." -ForegroundColor Green
npm install
npm run build

# -----------------------------------------------------------------------------
# 3. Build Frontend Locally
# -----------------------------------------------------------------------------
Write-Host "`n[3/10] Building frontend..." -ForegroundColor Green
Push-Location client
try {
    # Set environment variable for the current process
    $env:VITE_API_URL = if ($Environment -eq "staging") { "https://dev-api.ixasales.uz/api" } else { "https://api.ixasales.uz/api" }
    Write-Host "Setting VITE_API_URL to $env:VITE_API_URL" -ForegroundColor Yellow
    
    npm install
    npm run build
} finally {
    Pop-Location
}

# -----------------------------------------------------------------------------
# 4. Sync Files to Server using SCP (rsync alternative for Windows)
# -----------------------------------------------------------------------------
Write-Host "`n[4/10] Syncing files to server..." -ForegroundColor Green

# Create a list of items to upload (excluding unwanted folders)
$excludeDirs = @("node_modules", ".git", "backups")
$excludeFiles = @(".env")

# Get all items except excluded ones
$items = Get-ChildItem -Path . -Exclude $excludeDirs | Where-Object { 
    $_.Name -notin $excludeFiles -and $_.Name -ne "node_modules"
}

# Create temp directory with files to upload
$tempDir = Join-Path $env:TEMP "ixasales_deploy"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

foreach ($item in $items) {
    if ($item.PSIsContainer) {
        if ($item.Name -eq "client") {
            # For client, only copy dist folder
            $clientDest = Join-Path $tempDir "client"
            New-Item -ItemType Directory -Path $clientDest | Out-Null
            Copy-Item -Path "client\dist" -Destination $clientDest -Recurse -Force
            Copy-Item -Path "client\public" -Destination $clientDest -Recurse -Force -ErrorAction SilentlyContinue
        } elseif ($item.Name -notin @("node_modules", ".git", "backups", "dist", "uploads")) {
            Copy-Item -Path $item.FullName -Destination $tempDir -Recurse -Force
        }
    } else {
        if ($item.Name -ne ".env") {
            Copy-Item -Path $item.FullName -Destination $tempDir -Force
        }
    }
}

# Copy backend build output
if (Test-Path "dist") {
    Copy-Item -Path "dist" -Destination $tempDir -Recurse -Force
}

# Copy important root files
Copy-Item -Path "package.json" -Destination $tempDir -Force
Copy-Item -Path "tsconfig.json" -Destination $tempDir -Force -ErrorAction SilentlyContinue
Copy-Item -Path "drizzle.config.ts" -Destination $tempDir -Force -ErrorAction SilentlyContinue

# Copy drizzle migrations folder if it exists
if (Test-Path "drizzle") {
    Copy-Item -Path "drizzle" -Destination $tempDir -Recurse -Force
}

# Upload using SCP (use relative path from temp directory for better Windows compatibility)
Write-Host "Uploading files via SCP (this may take a few minutes)..." -ForegroundColor Yellow
Push-Location $tempDir
try {
    # Use . to copy all contents, which works better with Windows SCP
    scp -r . "${SERVER_USER}@${SERVER_IP}:${TARGET_DIR}/"
} finally {
    Pop-Location
}

# Cleanup temp directory
Remove-Item -Recurse -Force $tempDir

# -----------------------------------------------------------------------------
# 5. Install Dependencies on Server (Production only)
# -----------------------------------------------------------------------------
Write-Host "`n[5/10] Installing dependencies on server..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && npm install --omit=dev --include=optional --force"

# -----------------------------------------------------------------------------
# 6. Configure CORS (Auto-fix CORS_ORIGIN in .env)
# -----------------------------------------------------------------------------
Write-Host "`n[6/10] Configuring CORS..." -ForegroundColor Green
$CORS_ORIGIN = if ($Environment -eq "staging") { "https://dev.ixasales.uz" } else { "https://ixasales.uz" }

# Execute CORS configuration via SSH with simpler, safer approach
if ($Environment -eq "staging") {
    $corsCommand = "cd '$TARGET_DIR' && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz|' .env && echo 'Updated CORS_ORIGIN to https://dev.ixasales.uz'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=https://dev.ixasales.uz' >> .env && echo 'Added CORS_ORIGIN=https://dev.ixasales.uz'; fi; else echo 'WARNING: .env file not found'; fi"
} else {
    $corsCommand = "cd '$TARGET_DIR' && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://ixasales.uz|' .env && echo 'Updated CORS_ORIGIN to https://ixasales.uz'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=https://ixasales.uz' >> .env && echo 'Added CORS_ORIGIN=https://ixasales.uz'; fi; else echo 'WARNING: .env file not found'; fi"
}
ssh "$SERVER_USER@$SERVER_IP" $corsCommand

# -----------------------------------------------------------------------------
# 7. Run Database Migrations
# -----------------------------------------------------------------------------
Write-Host "`n[7/10] Running GPS tracking migration..." -ForegroundColor Green
ssh "$SERVER_USER@$SERVER_IP" "cd $TARGET_DIR && npx tsx src/db/migrations/add_gps_tracking.ts"

# -----------------------------------------------------------------------------
# 8. Verify Installation
# -----------------------------------------------------------------------------
Write-Host "`n[8/10] Verifying installation..." -ForegroundColor Green
ssh "$SERVER_USER@$SERVER_IP" "cd $TARGET_DIR && test -f dist/index-fastify.js && echo 'Backend build found' || echo 'WARNING: Backend build not found'"

# -----------------------------------------------------------------------------
# 9. Fix Permissions & Restart Service
# -----------------------------------------------------------------------------
Write-Host "`n[9/10] Fixing permissions & restarting service..." -ForegroundColor Green
ssh "$SERVER_USER@$SERVER_IP" -t "sudo chmod 755 /var/www/ixasales && sudo chmod 755 $TARGET_DIR && sudo chmod 755 $TARGET_DIR/client && sudo chmod -R 755 $TARGET_DIR/client/dist && sudo systemctl restart $SERVICE_NAME"

# -----------------------------------------------------------------------------
# 10. Verify Service is Running
# -----------------------------------------------------------------------------
Write-Host "`n[10/10] Verifying service status..." -ForegroundColor Green
$serviceStatus = ssh "$SERVER_USER@$SERVER_IP" "sudo systemctl is-active $SERVICE_NAME"
if ($serviceStatus.Trim() -ne "active") {
    Write-Host "ERROR: Service $SERVICE_NAME is not active (status: $serviceStatus)" -ForegroundColor Red
    exit 1
}
Write-Host "Service $SERVICE_NAME is active" -ForegroundColor Green

# -----------------------------------------------------------------------------
# 11. Perform Health Check
# -----------------------------------------------------------------------------
Write-Host "`n[11/11] Performing health check..." -ForegroundColor Green
$healthCheckUrl = if ($Environment -eq "staging") { "https://dev-api.ixasales.uz/health" } else { "https://api.ixasales.uz/health" }

# Wait a moment for the service to be ready
Start-Sleep -Seconds 3

try {
    $response = Invoke-RestMethod -Uri $healthCheckUrl -Method Get -TimeoutSec 10
    if ($response.status -eq "ok") {
        Write-Host "[SUCCESS] Health check passed: Service is responding" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Health check responded but status is not OK: $($response | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Attempting to check service logs..." -ForegroundColor Yellow
    ssh "${SERVER_USER}@${SERVER_IP}" "journalctl -u $SERVICE_NAME --no-pager -n 20"
    exit 1
}

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Staging URL: https://dev.ixasales.uz" -ForegroundColor Cyan
Write-Host "API URL: https://dev-api.ixasales.uz" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs: ssh `"${SERVER_USER}@${SERVER_IP}`" 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Yellow