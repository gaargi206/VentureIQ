# VentureIQ API

Base URL: `http://127.0.0.1:8000`

Interactive docs: `/docs`  
ReDoc: `/redoc`  
OpenAPI JSON: `/openapi.json`

## Endpoints

### `GET /api/health`
Returns service health and API version.

### `GET /api/meta`
Returns workspace state, supported formats, available industries/stages, columns and data-quality metadata.

### `GET /api/summary`
Returns dashboard-level statistics for the active in-memory workspace.

### `GET /api/startups`
Search/filter the active workspace.

Query parameters:

- `search`
- `industry`
- `stage`
- `min_score` (0–100)
- `min_funding`
- `min_growth`
- `sort`: `score`, `growth`, `funding`, `name`
- `page`
- `page_size` (1–100)

### `GET /api/startups/{startup_id}`
Returns the full analyzed record and score breakdown for one startup.

### `GET /api/scoring`
Returns the current deterministic scoring categories and weights.

### `POST /api/analyze`
Multipart upload:

- `dataset`: CSV/XLSX/XLS
- `deck`: optional PDF/PPTX
- `startup_id`: optional query parameter used to pair the deck with a specific startup

A successful request replaces the active in-memory workspace.

### `POST /api/reset`
Clears the active workspace. This is the endpoint called by the UI Reset button.

## Error handling

The API returns normal HTTP status codes with a JSON `detail` message for invalid formats, empty files, oversized uploads, unreadable datasets, missing startup IDs and pitch-deck parsing failures.
