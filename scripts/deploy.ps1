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
# 1. Build Frontend Locally
# -----------------------------------------------------------------------------
Write-Host "`n[1/5] Building frontend..." -ForegroundColor Green
Push-Location client
try {
    # Set environment variable for the current process
    $env:VITE_API_URL = if ($Environment -eq "staging") { "https://dev-api.ixasales.uz/api" } else { "https://api.ixasales.uz/api" }
    Write-Host "Setting VITE_API_URL to $env:VITE_API_URL" -ForegroundColor Yellow
    
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        bun install
        bun run build
    } else {
        npm install
        npm run build
    }
} finally {
    Pop-Location
}

# -----------------------------------------------------------------------------
# 2. Sync Files to Server using SCP (rsync alternative for Windows)
# -----------------------------------------------------------------------------
Write-Host "`n[2/5] Syncing files to server..." -ForegroundColor Green

# Create a list of items to upload (excluding unwanted folders)
$excludeDirs = @("node_modules", ".git", "backups", "dist")
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

# Copy important root files
Copy-Item -Path "package.json" -Destination $tempDir -Force
Copy-Item -Path "tsconfig.json" -Destination $tempDir -Force -ErrorAction SilentlyContinue
Copy-Item -Path "drizzle.config.ts" -Destination $tempDir -Force -ErrorAction SilentlyContinue

# Upload using SCP
Write-Host "Uploading files via SCP (this may take a few minutes)..." -ForegroundColor Yellow
scp -r "$tempDir\*" "${SERVER_USER}@${SERVER_IP}:${TARGET_DIR}/"

# Cleanup temp directory
Remove-Item -Recurse -Force $tempDir

# -----------------------------------------------------------------------------
# 3. Install Dependencies on Server
# -----------------------------------------------------------------------------
Write-Host "`n[3/5] Installing dependencies on server..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && source ~/.bashrc && ~/.bun/bin/bun install --production"

# -----------------------------------------------------------------------------
# 4. Run Database Migrations
# -----------------------------------------------------------------------------
Write-Host "`n[4/5] Running database migrations..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" -t "cd $TARGET_DIR && source ~/.bashrc && ~/.bun/bin/bun x drizzle-kit push"

# -----------------------------------------------------------------------------
# 5. Fix Permissions & Restart Service
# -----------------------------------------------------------------------------
Write-Host "`n[5/5] Fixing permissions & restarting service..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" -t "sudo chmod 755 /var/www/ixasales && sudo chmod 755 $TARGET_DIR && sudo chmod 755 $TARGET_DIR/client && sudo chmod -R 755 $TARGET_DIR/client/dist && sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager"

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Staging URL: https://dev.ixasales.uz" -ForegroundColor Cyan
Write-Host "API URL: https://dev-api.ixasales.uz" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs: ssh ${SERVER_USER}@${SERVER_IP} 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Yellow
