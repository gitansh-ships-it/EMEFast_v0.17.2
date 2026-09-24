#!/usr/bin/env bash
# EMEFast - Development Server Runner (Bash / Unix / macOS)

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=================================================="
echo " Starting EMEFast Development Environment"
echo "=================================================="

# Function to kill child processes on exit
cleanup() {
    echo -e "\nStopping servers..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start FastAPI backend
echo "Starting FastAPI Backend (http://localhost:8000)..."
cd "$ROOT_DIR/backend"
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi
uvicorn main:app --reload --port 8000 &

# Start Next.js frontend
echo "Starting Next.js Frontend (http://localhost:3000)..."
cd "$ROOT_DIR/frontend-v2"
npm run dev
