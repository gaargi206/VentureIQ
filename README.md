# VentureIQ — VQ Screener v3

VentureIQ is a clean-slate startup screening and investment-intelligence web app. The supplied VQ reference is used as the visual system: cream surface, Space Grotesk + Inter, sharp 2px borders, offset shadows, yellow/blue/red accents, dense startup cards, search/filter controls and bottom navigation.

## What changed

- Runtime starts with **zero startup data**. There is no bundled sample dataset.
- Added a true **Reset** control that clears the in-memory backend workspace, watchlist, filters, selected startup and analysis state.
- Rebuilt the frontend as a **zero-build vanilla JavaScript SPA**. Node/npm are not required to run the app.
- All five app tabs are functional: **Dashboard, Find, Compare, Data, Watch**.
- Find supports search, sector, stage, score/funding/growth quick filters, sorting and pagination.
- Compare supports selecting up to three startups and renders a live comparison table.
- Watchlist persists in browser localStorage and is cleared by Reset.
- Data shows dataset quality, active columns, scoring weights and pitch intelligence.
- Startup detail shows score breakdown, risk flags, completeness and raw fields.
- Dataset uploads support CSV/XLSX/XLS. Optional pitch decks support PDF/PPTX.
- The API exposes Swagger at `/docs`, ReDoc at `/redoc`, and OpenAPI JSON at `/openapi.json`.

## Run the complete project

You only need Python for this version:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

Open:

- App: http://127.0.0.1:8000/
- Swagger: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- OpenAPI: http://127.0.0.1:8000/openapi.json

## Clean slate behavior

The `data/` directory contains only `.gitkeep`. Uploaded files are handled in temporary files, analyzed in memory, and deleted after the request. Nothing is persisted as an app sample dataset.

The backend exposes `POST /api/reset` for the same reset action used by the UI.

## Project structure

```text
VentureIQ/
├── backend/
│   ├── main.py
│   ├── api/
│   ├── schemas/
│   └── services/
├── pipeline/
│   ├── engine.py
│   └── scoring.py
├── config/
├── data/
├── docs/
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── README.md
├── tests/
├── requirements.txt
└── README.md
```

## Scoring note

The VIQ score is a deterministic screening heuristic. It is not financial advice. The UI exposes the weights, category scores and red flags so the result can be challenged during diligence.
