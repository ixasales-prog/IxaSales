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
# 1. Build Backend Locally
# -----------------------------------------------------------------------------
Write-Host "`n[1/7] Building backend..." -ForegroundColor Green
npm install
npm run build

# -----------------------------------------------------------------------------
# 2. Build Frontend Locally
# -----------------------------------------------------------------------------
Write-Host "`n[2/7] Building frontend..." -ForegroundColor Green
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
# 3. Sync Files to Server using SCP (rsync alternative for Windows)
# -----------------------------------------------------------------------------
Write-Host "`n[3/7] Syncing files to server..." -ForegroundColor Green

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
# 4. Install Dependencies on Server (Production only)
# -----------------------------------------------------------------------------
Write-Host "`n[4/7] Installing dependencies on server..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && npm install --omit=dev"

# -----------------------------------------------------------------------------
# 5. Run Database Migrations
# -----------------------------------------------------------------------------
# Write-Host "`n[5/7] Running database migrations..." -ForegroundColor Green
# ssh "${SERVER_USER}@${SERVER_IP}" -t "cd $TARGET_DIR && npm run db:push"
Write-Host "`n[5/7] Skipping database migrations (uncomment to enable)..." -ForegroundColor Yellow

# -----------------------------------------------------------------------------
# 6. Verify Installation
# -----------------------------------------------------------------------------
Write-Host "`n[6/7] Verifying installation..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && test -f dist/index.js && echo 'Backend build found' || echo 'WARNING: Backend build not found'"

# -----------------------------------------------------------------------------
# 7. Fix Permissions & Restart Service
# -----------------------------------------------------------------------------
Write-Host "`n[7/7] Fixing permissions & restarting service..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" -t "sudo chmod 755 /var/www/ixasales && sudo chmod 755 $TARGET_DIR && sudo chmod 755 $TARGET_DIR/client && sudo chmod -R 755 $TARGET_DIR/client/dist && sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager"

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Staging URL: https://dev.ixasales.uz" -ForegroundColor Cyan
Write-Host "API URL: https://dev-api.ixasales.uz" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs: ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Yellow
