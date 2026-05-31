# package.ps1 - Build and package pe-sub-ui for standalone deployment
# Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts\package.ps1
#
# Output: dist\pe-sub-ui-v<version>.tar.gz

param(
    [string]$Version = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pkg = Get-Content "package.json" | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
$stageDir = "pe-sub-ui-v$Version"
$archive  = "dist\pe-sub-ui-v$Version.tar.gz"

Write-Host ""
Write-Host "==> Building pe-sub-ui v$Version" -ForegroundColor Cyan

Write-Host "--> npm install"
npm install --prefer-offline
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "--> npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

if (-not (Test-Path "dist\index.html")) { throw "dist\index.html not found — build may have failed" }

Write-Host "--> Creating archive: $archive"
if (Test-Path $stageDir)  { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory $stageDir | Out-Null
Copy-Item "dist\*" -Destination $stageDir -Recurse -Force

if (Test-Path $archive) { Remove-Item $archive -Force }
tar -czf $archive $stageDir
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

Remove-Item $stageDir -Recurse -Force

$size = [math]::Round((Get-Item $archive).Length / 1KB, 1)
Write-Host ""
Write-Host "==> Package ready: $archive ($size KB)" -ForegroundColor Green
Write-Host ""
