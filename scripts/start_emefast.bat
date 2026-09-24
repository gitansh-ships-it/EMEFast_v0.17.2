@echo off
setlocal
cd /d "%~dp0"
echo Starting EMEFast Development Stack...
powershell -ExecutionPolicy Bypass -File "%~dp0dev.ps1"
