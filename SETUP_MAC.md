# VentureIQ — Mac setup

This build does **not** require Node, npm, React, Tailwind or a second frontend server.

From the project folder:

```bash
./start_mac.sh
```

Or manually:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

Open `http://127.0.0.1:8000/` for the full app.

API docs:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`
- `http://127.0.0.1:8000/openapi.json`

The terminal must remain open while the app is running. Stop it with `Ctrl+C`.
