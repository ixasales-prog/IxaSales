# =============================================================================
# Check Service Status and Health (PowerShell)
# Run from: Windows PowerShell
# Usage: .\scripts\check-service.ps1 staging
# =============================================================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Configuration
$SERVER_IP = "176.96.241.152"
$SERVER_USER = "ilhom1983"

if ($Environment -ne "staging" -and $Environment -ne "production") {
    Write-Host "Usage: .\check-service.ps1 [staging|production]" -ForegroundColor Red
    exit 1
}

# Determine service name and URLs
if ($Environment -eq "staging") {
    $SERVICE_NAME = "ixasales-staging"
    $HEALTH_URL = "https://dev-api.ixasales.uz/health"
    $APP_URL = "https://dev.ixasales.uz"
} else {
    $SERVICE_NAME = "ixasales-production"
    $HEALTH_URL = "https://api.ixasales.uz/health"
    $APP_URL = "https://ixasales.uz"
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Checking service status for $Environment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check service status on server
Write-Host "🔍 Checking service status..." -ForegroundColor White
try {
    $SERVICE_STATUS = ssh "$SERVER_USER@$SERVER_IP" "sudo systemctl is-active $SERVICE_NAME" 2>$null
    $SERVICE_STATUS = $SERVICE_STATUS.Trim()
    Write-Host "Service $SERVICE_NAME: $SERVICE_STATUS"
    
    if ($SERVICE_STATUS -eq "active") {
        Write-Host "✓ Service is running" -ForegroundColor Green
    } else {
        Write-Host "✗ Service is not active" -ForegroundColor Red
        Write-Host "Getting service status details..." -ForegroundColor Yellow
        ssh "$SERVER_USER@$SERVER_IP" "sudo systemctl status $SERVICE_NAME --no-pager" 2>$null
        Write-Host ""
    }
} catch {
    Write-Host "✗ Could not check service status: $($_.Exception.Message)" -ForegroundColor Red
}

# Check process status
Write-Host ""
Write-Host "🔍 Checking process status..." -ForegroundColor White
try {
    $PROCESS_STATUS = ssh "$SERVER_USER@$SERVER_IP" "ps aux | grep -v grep | grep node | grep index-fastify" 2>$null
    if ($PROCESS_STATUS) {
        Write-Host "✓ Node process is running" -ForegroundColor Green
        Write-Host $PROCESS_STATUS
    } else {
        Write-Host "⚠ Node process may not be running" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not check process status: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Check ports
Write-Host "🔍 Checking port binding..." -ForegroundColor White
try {
    $PORT_STATUS = ssh "$SERVER_USER@$SERVER_IP" "sudo netstat -tlnp | grep ':3001 '" 2>$null
    if ($PORT_STATUS) {
        Write-Host "✓ Port 3001 is bound" -ForegroundColor Green
        Write-Host $PORT_STATUS
    } else {
        Write-Host "⚠ Port 3001 may not be bound" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not check port status: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Check health endpoint
Write-Host "🔍 Testing health endpoint..." -ForegroundColor White
try {
    $response = Invoke-RestMethod -Uri $HEALTH_URL -Method Get -TimeoutSec 10
    if ($response.status -eq "ok") {
        Write-Host "✓ Health endpoint reachable and healthy" -ForegroundColor Green
        Write-Host "Health data: $($response | ConvertTo-Json -Compress)"
    } else {
        Write-Host "⚠ Health endpoint returned: $($response | ConvertTo-Json -Compress)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Health endpoint not reachable: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Check application logs
Write-Host "🔍 Recent application logs:" -ForegroundColor White
try {
    ssh "$SERVER_USER@$SERVER_IP" "journalctl -u $SERVICE_NAME --no-pager -n 15" 2>$null
} catch {
    Write-Host "Could not retrieve logs: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Service check complete" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "App URL: $APP_URL" -ForegroundColor Cyan
Write-Host "Health URL: $HEALTH_URL" -ForegroundColor Cyan
Write-Host "Service: $SERVICE_NAME" -ForegroundColor Cyan
Write-Host ""