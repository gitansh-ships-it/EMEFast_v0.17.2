# EMEFast - Development Server Runner (PowerShell)
# Launches FastAPI backend on port 8000 and Next.js frontend on port 3000

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Starting EMEFast Development Environment" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend-v2"

# Start FastAPI in a separate process
Write-Host "Starting FastAPI Backend (http://localhost:8000)..." -ForegroundColor Yellow
$BackendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; if (Test-Path .venv\Scripts\activate.ps1) { .\.venv\Scripts\activate.ps1 }; uvicorn main:app --reload --port 8000" -PassThru

# Start Next.js frontend in current process
Write-Host "Starting Next.js Frontend (http://localhost:3000)..." -ForegroundColor Yellow
Set-Location $FrontendDir
npm run dev
