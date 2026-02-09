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
Write-Host "`n[1/9] Building backend..." -ForegroundColor Green
npm install
npm run build

# -----------------------------------------------------------------------------
# 2. Build Frontend Locally
# -----------------------------------------------------------------------------
Write-Host "`n[2/9] Building frontend..." -ForegroundColor Green
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
Write-Host "`n[3/9] Syncing files to server..." -ForegroundColor Green

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
Write-Host "`n[4/9] Installing dependencies on server..." -ForegroundColor Green
ssh "${SERVER_USER}@${SERVER_IP}" "cd $TARGET_DIR && npm install --omit=dev --include=optional --force"

# -----------------------------------------------------------------------------
# 5. Configure CORS (Auto-fix CORS_ORIGIN in .env)
# -----------------------------------------------------------------------------
Write-Host "`n[5/9] Configuring CORS..." -ForegroundColor Green
$CORS_ORIGIN = if ($Environment -eq "staging") { "https://dev.ixasales.uz" } else { "https://ixasales.uz" }

# Execute CORS configuration via SSH with simpler, safer approach
if ($Environment -eq "staging") {
    $corsCommand = "cd '$TARGET_DIR' && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz|' .env && echo 'Updated CORS_ORIGIN to https://dev.ixasales.uz'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=https://dev.ixasales.uz' >> .env && echo 'Added CORS_ORIGIN=https://dev.ixasales.uz'; fi; else echo 'WARNING: .env file not found'; fi"
} else {
    $corsCommand = "cd '$TARGET_DIR' && if [ -f .env ]; then if grep -q '^CORS_ORIGIN=' .env; then sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://ixasales.uz|' .env && echo 'Updated CORS_ORIGIN to https://ixasales.uz'; else echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=https://ixasales.uz' >> .env && echo 'Added CORS_ORIGIN=https://ixasales.uz'; fi; else echo 'WARNING: .env file not found'; fi"
}
ssh "$SERVER_USER@$SERVER_IP" $corsCommand

# -----------------------------------------------------------------------------
# 6. Run Database Migrations
# -----------------------------------------------------------------------------
Write-Host "`n[6/9] Running GPS tracking migration..." -ForegroundColor Green
# Use npx with --yes to auto-install if needed, and handle permission issues gracefully
ssh "$SERVER_USER@$SERVER_IP" "cd $TARGET_DIR && (npx --yes tsx src/db/migrations/add_gps_tracking.ts 2>/dev/null || node --loader ts-node/esm src/db/migrations/add_gps_tracking.ts 2>/dev/null || echo 'Migration skipped - run manually if needed')"

# -----------------------------------------------------------------------------
# 7. Verify Installation
# -----------------------------------------------------------------------------
Write-Host "`n[7/9] Verifying installation..." -ForegroundColor Green
ssh "$SERVER_USER@$SERVER_IP" "cd $TARGET_DIR && test -f dist/index-fastify.js && echo 'Backend build found' || echo 'WARNING: Backend build not found'"

# -----------------------------------------------------------------------------
# 8. Fix Permissions & Restart Service (without sudo password prompt)
# -----------------------------------------------------------------------------
Write-Host "`n[8/9] Fixing permissions & restarting service..." -ForegroundColor Green
# Kill any process using the port before restarting to prevent EADDRINUSE errors
$port = if ($Environment -eq "staging") { "3001" } else { "3000" }
ssh "$SERVER_USER@$SERVER_IP" "sudo lsof -ti :$port 2>/dev/null | xargs -r sudo kill -9 2>/dev/null; echo 'Port $port cleared'"

# Fix ownership and permissions for nginx and service access
# Using sudo -S with password provided via stdin for reliable permission fixes
$password = "HelpMe11"

# Change ownership to ilhom1983 for service access (service runs as ilhom1983 user)
# and ensure dist folder is readable by the service user
ssh "$SERVER_USER@$SERVER_IP" "echo '$password' | sudo -S chown -R ilhom1983:ilhom1983 $TARGET_DIR/dist 2>/dev/null || echo 'Note: chown may require password on server'"
ssh "$SERVER_USER@$SERVER_IP" "echo '$password' | sudo -S chmod -R 755 $TARGET_DIR/dist 2>/dev/null || true"

# Also fix client dist permissions for nginx
ssh "$SERVER_USER@$SERVER_IP" "echo '$password' | sudo -S chown -R www-data:www-data $TARGET_DIR/client/dist 2>/dev/null || true"
ssh "$SERVER_USER@$SERVER_IP" "echo '$password' | sudo -S chmod -R 755 $TARGET_DIR/client/dist 2>/dev/null || true"

# Kill any process using the port before restarting to prevent EADDRINUSE errors
$port = if ($Environment -eq "staging") { "3001" } else { "3000" }
ssh "$SERVER_USER@$SERVER_IP" "echo '$password' | sudo -S sh -c 'lsof -ti :$port | xargs -r kill -9 2>/dev/null; echo Port $port cleared'"

# Restart the service
ssh "$SERVER_USER@$SERVER_IP" "echo '$password' | sudo -S systemctl restart $SERVICE_NAME 2>/dev/null || echo 'WARNING: Could not restart service - may need manual restart with password'"

# -----------------------------------------------------------------------------
# 9. Verify Service & Health Check
# -----------------------------------------------------------------------------
Write-Host "`n[9/9] Verifying service status..." -ForegroundColor Green
$serviceStatus = ssh "$SERVER_USER@$SERVER_IP" "sudo -n systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'unknown'"
if ($serviceStatus.Trim() -ne "active") {
    Write-Host "WARNING: Service $SERVICE_NAME status is: $($serviceStatus.Trim())" -ForegroundColor Yellow
    Write-Host "You may need to manually restart the service on the server:" -ForegroundColor Yellow
    Write-Host "  ssh $SERVER_USER@$SERVER_IP" -ForegroundColor Cyan
    Write-Host "  sudo systemctl restart $SERVICE_NAME" -ForegroundColor Cyan
} else {
    Write-Host "Service $SERVICE_NAME is active" -ForegroundColor Green
}

# Perform health check
$healthCheckUrl = if ($Environment -eq "staging") { "https://dev-api.ixasales.uz/health" } else { "https://api.ixasales.uz/health" }

# Wait a moment for the service to be ready
Start-Sleep -Seconds 5

try {
    $response = Invoke-RestMethod -Uri $healthCheckUrl -Method Get -TimeoutSec 10
    if ($response.status -eq "ok") {
        Write-Host "[SUCCESS] Health check passed: Service is responding" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Health check responded but status is not OK: $($response | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "This may be normal if the service is still starting up." -ForegroundColor Yellow
    Write-Host "Check service status manually:" -ForegroundColor Yellow
    Write-Host "  ssh $SERVER_USER@$SERVER_IP 'sudo systemctl status $SERVICE_NAME'" -ForegroundColor Cyan
}

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Staging URL: https://dev.ixasales.uz" -ForegroundColor Cyan
Write-Host "API URL: https://dev-api.ixasales.uz" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check logs: ssh `"${SERVER_USER}@${SERVER_IP}`" 'journalctl -u $SERVICE_NAME -f'" -ForegroundColor Yellow