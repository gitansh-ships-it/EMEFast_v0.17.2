#!/usr/bin/env bash
# EMEFast - Automated Environment Setup (Bash / Unix / macOS)

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=================================================="
echo "🚑 EMEFast - Project Setup"
echo "=================================================="

# 1. Backend Setup
echo -e "\n[1/2] Setting up Python FastAPI backend..."
cd "$ROOT_DIR/backend"
if [ ! -d ".venv" ]; then
    echo "  Creating virtual environment in .venv..."
    python3 -m venv .venv || python -m venv .venv
fi

if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi

echo "  Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 2. Frontend Setup
echo -e "\n[2/2] Setting up Next.js frontend (frontend-v2)..."
cd "$ROOT_DIR/frontend-v2"
echo "  Installing npm packages..."
npm install

cd "$ROOT_DIR"
echo -e "\n=================================================="
echo " Setup Completed Successfully!"
echo " Run './scripts/dev.sh' to start development servers."
echo "=================================================="
