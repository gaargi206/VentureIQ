# Original project audit

Audited from the supplied `VentureIQ(1).zip` and the supplied VQ HTML design reference.

## Findings

1. `backend/main.py` was present and depended on `pipeline.engine` plus four service modules.
2. The actual `pipeline` implementation was absent from the ZIP. The included `pipeline/README.md` explicitly says the original source was cloned from an external GitHub repository.
3. The frontend package configuration and Vite config were present, but the usable `frontend/src` source was absent from the ZIP.
4. Several compiled Python `__pycache__/*.pyc` files existed. Those are runtime artifacts and were not treated as maintainable source.
5. The old API had only two public routes: `/api/health` and `/api/analyze`. There was no documented OpenAPI-oriented API surface beyond FastAPI's default behavior.
6. The old analyze endpoint always selected the first analyzed startup, which made multi-startup datasets difficult to use from a real screener UI.

## Rebuild decisions

- Reimplemented the missing dataset pipeline as a deterministic, inspectable scoring engine.
- Added typed API documentation and schemas.
- Added startup list/search/filter/sort/detail endpoints for the screener.
- Kept `/api/analyze` and expanded it with optional `startup_id` selection and pitch intelligence.
- Added `/docs`, `/redoc`, and `/openapi.json` as first-class documented API surfaces.
- Rebuilt the frontend around the supplied VQ design reference rather than the previous dark landing-page styling.
- Added a self-contained sample dataset and automated API tests.

## Design reference incorporated

The supplied reference uses:
- `#f5f0e8` cream surface
- Space Grotesk headings + Inter body
- sharp rectangular controls
- 2px black borders
- 4px offset black shadows
- yellow `#ffcc00`, red `#e63b2e`, blue `#0055ff`
- startup search, sector/stage/score/funding/growth filters
- dense startup cards with stage, raised, growth and VIQ score
- dashboard/compare/data/watch navigation
