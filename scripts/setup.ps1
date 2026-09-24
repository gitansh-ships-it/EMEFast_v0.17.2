# EMEFast - Automated Environment Setup (PowerShell)
# Sets up Python virtual environment, dependencies, and frontend npm packages

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "🚑 EMEFast - Project Setup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Backend Setup
Write-Host "`n[1/2] Setting up Python FastAPI backend..." -ForegroundColor Yellow
$BackendDir = Join-Path $RootDir "backend"
Set-Location $BackendDir

$VenvDir = Join-Path $BackendDir ".venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "  Creating virtual environment in $VenvDir..."
    python -m venv .venv
}

$PythonExe = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

Write-Host "  Installing Python dependencies from requirements.txt..."
& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r requirements.txt

# 2. Frontend Setup
Write-Host "`n[2/2] Setting up Next.js frontend (frontend-v2)..." -ForegroundColor Yellow
$FrontendDir = Join-Path $RootDir "frontend-v2"
Set-Location $FrontendDir

Write-Host "  Installing npm dependencies in frontend-v2..."
npm install

Set-Location $RootDir
Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " Setup Completed Successfully!" -ForegroundColor Green
Write-Host " Run '.\scripts\dev.ps1' to start development servers." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
