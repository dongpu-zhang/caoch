#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
( sleep 2; open "http://127.0.0.1:${PORT:-8765}" 2>/dev/null || xdg-open "http://127.0.0.1:${PORT:-8765}" 2>/dev/null ) &
python app.py
