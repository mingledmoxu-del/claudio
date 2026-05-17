# Claudio AI Music Package Script (Folder + Zip)
$ErrorActionPreference = "Stop"

# Set Mirror
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

function Run-Command {
    param([string]$Command, [string]$Dir)
    Write-Host "`n>>> Running: $Command in $Dir" -ForegroundColor Yellow
    Push-Location $Dir
    try {
        cmd /c $Command
        if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

Write-Host "--- Starting Package Process ---" -ForegroundColor Cyan

# 1. Build Client
Run-Command "npm run build" "client"

# 2. Prepare Server
Run-Command "npm install" "server"
Run-Command "npm run build" "server"

# 3. Rebuild Native Modules for Electron 34.5.8
# ABI 132 is for Electron 34
Write-Host "`n--- Rebuilding Native Modules (better-sqlite3) for Electron ---" -ForegroundColor Yellow
# We run rebuild from root but point to server folder
npx electron-rebuild -v 34.5.8 -m server

Write-Host "`n--- Executing Electron Packager ---" -ForegroundColor Cyan
Run-Command "npm run package:win" "."

Write-Host "`n--- Creating Zip Archive ---" -ForegroundColor Cyan
$outDir = "dist_electron/Claudio AI Music-win32-x64"
$zipFile = "dist_electron/Claudio-AI-Music-v1.0.0-win64.zip"

if (Test-Path $zipFile) { Remove-Item $zipFile }
Compress-Archive -Path "$outDir/*" -DestinationPath $zipFile

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "Build Successful!" -ForegroundColor Green
Write-Host "Folder: $outDir" -ForegroundColor Green
Write-Host "Zip: $zipFile" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
