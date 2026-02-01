# Fix script to restart staging service with proper sudo handling
$ErrorActionPreference = "Stop"

$SERVER = "ilhom1983@176.96.241.152"
$SERVICE = "ixasales-staging"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Fixing Staging Service" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Check if we can connect
Write-Host "`nChecking SSH connection..." -ForegroundColor Yellow
try {
    $result = ssh -o ConnectTimeout=5 $SERVER "echo 'Connection successful'" 2>&1
    if ($result -match "Connection successful") {
        Write-Host "✅ SSH connection successful" -ForegroundColor Green
    } else {
        throw "Connection failed"
    }
} catch {
    Write-Host "❌ Cannot connect to server. Please check your SSH key setup." -ForegroundColor Red
    exit 1
}

# Try to restart the service
Write-Host "`nAttempting to restart $SERVICE..." -ForegroundColor Yellow
Write-Host "(You may be prompted for sudo password)`n" -ForegroundColor Gray

# Use -t flag to allocate pseudo-terminal for sudo password prompt
ssh -t $SERVER "sudo systemctl restart $SERVICE && sleep 3 && sudo systemctl status $SERVICE"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Service restarted successfully" -ForegroundColor Green
    Write-Host "`nTesting health endpoint..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-RestMethod -Uri "https://dev-api.ixasales.uz/health" -TimeoutSec 10
        Write-Host ($health | ConvertTo-Json) -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Health check failed: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n❌ Failed to restart service" -ForegroundColor Red
    Write-Host "`nAlternative: Run these commands manually on the server:" -ForegroundColor Yellow
    Write-Host "  ssh $SERVER" -ForegroundColor Gray
    Write-Host "  sudo systemctl restart $SERVICE" -ForegroundColor Gray
    Write-Host "  sudo systemctl status $SERVICE" -ForegroundColor Gray
}
