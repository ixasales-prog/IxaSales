param(
    [string]$Ref = "",
    [switch]$Watch
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI ('gh') is required for one-command staging deploys."
}

$resolvedRef = $Ref
if ([string]::IsNullOrWhiteSpace($resolvedRef)) {
    $resolvedRef = (git rev-parse --abbrev-ref HEAD).Trim()
}

if ([string]::IsNullOrWhiteSpace($resolvedRef)) {
    throw "Unable to determine git ref."
}

Write-Host "Triggering staging deploy for ref '$resolvedRef'..." -ForegroundColor Cyan
gh workflow run deploy-staging.yml --ref $resolvedRef
if ($LASTEXITCODE -ne 0) {
    throw "Failed to trigger deploy-staging.yml."
}

if ($Watch) {
    gh run watch
}
