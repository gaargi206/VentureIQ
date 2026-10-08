#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install -r requirements.txt
exec python -m uvicorn backend.main:app --reload --port 8000
