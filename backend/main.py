from __future__ import annotations

from pathlib import Path
from typing import Any
import tempfile
import threading
from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.schemas.models import AnalyzeResponse, StartupListResponse
from backend.services.consistency_checker import check_consistency
from backend.services.deck_extractor import extract_deck
from backend.services.investment_assessment import assess_investment
from backend.services.pitch_analyzer import analyze_pitch
from config.settings import CORS_ORIGINS, FRONTEND_DIR, MAX_UPLOAD_MB
from pipeline.engine import run_ventureiq
from pipeline.scoring import WEIGHTS

APP_VERSION = "3.0.0"

_workspace_lock = threading.RLock()
_ACTIVE_DATASET: dict[str, Any] | None = None
_WORKSPACE_LOADED_AT: str | None = None

app = FastAPI(
    title="VentureIQ API",
    version=APP_VERSION,
    description=(
        "VentureIQ startup investment intelligence API. Upload a startup dataset, "
        "score opportunities deterministically, optionally analyze a pitch deck, "
        "and consume the same workspace used by the VQ web app. The application "
        "starts empty and stays in-memory until you upload a dataset."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _active_result() -> dict[str, Any]:
    with _workspace_lock:
        return _ACTIVE_DATASET or {"startups": [], "rows_analyzed": 0, "columns": [], "data_quality": {}}


def _summary_records() -> list[dict[str, Any]]:
    return list(_active_result().get("startups", []))


def _numeric(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _summary_item(r: dict[str, Any]) -> dict[str, Any]:
    score = r.get("score", {})
    return {
        "startup_id": str(r.get("Startup_ID") or ""),
        "name": r.get("Startup_Name") or "Unnamed startup",
        "industry": r.get("Industry") or "Unclassified",
        "stage": r.get("Funding_Stage"),
        "location": r.get("Location"),
        "attractiveness_score": float(score.get("attractiveness_score", 0)),
        "risk_score": float(score.get("risk_score", 0)),
        "risk_level": score.get("risk_level", "Unknown"),
        "investment_category": score.get("investment_category", "Further Diligence"),
        "revenue": r.get("Revenue"),
        "funding_raised": r.get("Funding_Raised"),
        "revenue_growth": r.get("Revenue_Growth"),
        "customers": r.get("Customers"),
    }


@app.get("/api/health", tags=["System"], summary="Health check")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "ventureiq-api", "version": APP_VERSION}


@app.get("/api/meta", tags=["System"], summary="Workspace and API metadata")
def meta() -> dict[str, Any]:
    records = _summary_records()
    industries = sorted({str(r.get("Industry")) for r in records if r.get("Industry")})
    stages = sorted({str(r.get("Funding_Stage")) for r in records if r.get("Funding_Stage")})
    dq = _active_result().get("data_quality", {})
    return {
        "version": APP_VERSION,
        "scoring_categories": WEIGHTS,
        "supported_dataset_formats": ["csv", "xlsx", "xls"],
        "supported_deck_formats": ["pdf", "pptx"],
        "workspace_state": "loaded" if records else "empty",
        "sample_dataset_available": False,
        "rows_analyzed": len(records),
        "columns": _active_result().get("columns", []),
        "industries": industries,
        "stages": stages,
        "data_quality": dq,
        "loaded_at": _WORKSPACE_LOADED_AT,
        "max_upload_mb": MAX_UPLOAD_MB,
    }


@app.get("/api/summary", tags=["System"], summary="Dashboard summary")
def summary() -> dict[str, Any]:
    records = _summary_records()
    scores = [float(r.get("score", {}).get("attractiveness_score", 0)) for r in records]
    risk_levels = {k: sum(1 for r in records if r.get("score", {}).get("risk_level") == k) for k in ["Low", "Medium", "High"]}
    categories: dict[str, int] = {}
    industries: dict[str, int] = {}
    for r in records:
        cat = str(r.get("score", {}).get("investment_category") or "Unknown")
        ind = str(r.get("Industry") or "Unclassified")
        categories[cat] = categories.get(cat, 0) + 1
        industries[ind] = industries.get(ind, 0) + 1
    top = sorted(records, key=lambda r: float(r.get("score", {}).get("attractiveness_score", 0)), reverse=True)[:5]
    avg = round(sum(scores) / len(scores), 1) if scores else 0.0
    return {
        "workspace_state": "loaded" if records else "empty",
        "startup_count": len(records),
        "average_viq": avg,
        "median_viq": round(sorted(scores)[len(scores) // 2], 1) if scores else 0.0,
        "risk_levels": risk_levels,
        "investment_categories": categories,
        "industries": industries,
        "top_opportunities": [_summary_item(r) for r in top],
        "data_quality": _active_result().get("data_quality", {}),
        "columns": _active_result().get("columns", []),
        "loaded_at": _WORKSPACE_LOADED_AT,
        "max_upload_mb": MAX_UPLOAD_MB,
    }


@app.get("/api/startups", tags=["Startups"], response_model=StartupListResponse, summary="Search and filter startups")
def list_startups(
    search: str | None = Query(None, description="Search startup name, industry, founder or location"),
    industry: str | None = None,
    stage: str | None = None,
    min_score: float | None = Query(None, ge=0, le=100),
    min_funding: float | None = Query(None, ge=0),
    min_growth: float | None = Query(None),
    sort: str = Query("score", pattern="^(score|growth|funding|name)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> dict[str, Any]:
    records = _summary_records()
    if search:
        q = search.strip().lower()
        search_fields = ["Startup_Name", "Industry", "Founder_Experience", "Location", "Business_Model"]
        records = [r for r in records if q in " ".join(str(r.get(k, "")) for k in search_fields).lower()]
    if industry:
        records = [r for r in records if str(r.get("Industry", "")).lower() == industry.lower()]
    if stage:
        records = [r for r in records if str(r.get("Funding_Stage", "")).lower() == stage.lower()]
    if min_score is not None:
        records = [r for r in records if float(r.get("score", {}).get("attractiveness_score", 0)) >= min_score]
    if min_funding is not None:
        records = [r for r in records if _numeric(r.get("Funding_Raised")) >= min_funding]
    if min_growth is not None:
        records = [r for r in records if _numeric(r.get("Revenue_Growth")) >= min_growth]

    key_map = {
        "score": lambda r: float(r.get("score", {}).get("attractiveness_score", 0)),
        "growth": lambda r: _numeric(r.get("Revenue_Growth")),
        "funding": lambda r: _numeric(r.get("Funding_Raised")),
        "name": lambda r: str(r.get("Startup_Name", "")).lower(),
    }
    records.sort(key=key_map[sort], reverse=sort != "name")

    total = len(records)
    start = (page - 1) * page_size
    items = [_summary_item(r) for r in records[start : start + page_size]]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "filters": {
            "search": search,
            "industry": industry,
            "stage": stage,
            "min_score": min_score,
            "min_funding": min_funding,
            "min_growth": min_growth,
            "sort": sort,
        },
        "items": items,
    }


@app.get("/api/startups/{startup_id}", tags=["Startups"], summary="Get a startup by ID")
def get_startup(startup_id: str) -> dict[str, Any]:
    for record in _summary_records():
        if str(record.get("Startup_ID", "")).lower() == startup_id.lower():
            return record
    raise HTTPException(status_code=404, detail="Startup not found")


@app.get("/api/scoring", tags=["Scoring"], summary="Scoring model and weights")
def scoring() -> dict[str, Any]:
    return {"weights": WEIGHTS, "scale": "0-100", "categories": list(WEIGHTS)}


@app.post("/api/reset", tags=["System"], summary="Reset the entire workspace")
def reset_workspace() -> dict[str, Any]:
    global _ACTIVE_DATASET, _WORKSPACE_LOADED_AT
    with _workspace_lock:
        _ACTIVE_DATASET = None
        _WORKSPACE_LOADED_AT = None
    return {
        "status": "ok",
        "workspace_state": "empty",
        "message": "Workspace reset. No startup data is loaded.",
    }


@app.post("/api/analyze", tags=["Analysis"], response_model=AnalyzeResponse, summary="Analyze a startup dataset")
async def analyze_startup(
    dataset: UploadFile = File(..., description="CSV/XLSX/XLS startup dataset"),
    deck: UploadFile | None = File(None, description="Optional PDF/PPTX pitch deck"),
    startup_id: str | None = Query(None, description="Startup ID to pair with the optional pitch deck"),
) -> dict[str, Any]:
    if not dataset.filename:
        raise HTTPException(400, "Dataset filename is required.")
    ds = Path(dataset.filename).suffix.lower()
    if ds not in {".csv", ".xlsx", ".xls"}:
        raise HTTPException(400, "Unsupported dataset format. Use CSV, XLSX or XLS.")
    if deck and deck.filename:
        deck_suffix = Path(deck.filename).suffix.lower()
        if deck_suffix not in {".pdf", ".pptx"}:
            raise HTTPException(400, "Unsupported pitch deck format. Use PDF or PPTX.")

    data = await dataset.read()
    if not data:
        raise HTTPException(400, "Dataset is empty.")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Dataset exceeds the {MAX_UPLOAD_MB} MB upload limit.")

    dataset_path: Path | None = None
    deck_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ds, delete=False) as f:
            f.write(data)
            dataset_path = Path(f.name)
        try:
            result = run_ventureiq(dataset_path)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(422, f"Could not analyze dataset: {exc}") from exc

        records = result.get("startups", [])
        if not records:
            raise HTTPException(400, "Dataset contains no startup rows.")

        selected = None
        if startup_id:
            selected = next(
                (x for x in records if str(x.get("Startup_ID", "")).lower() == startup_id.lower()),
                None,
            )
            if selected is None:
                raise HTTPException(404, "startup_id not found in uploaded dataset")
        else:
            selected = records[0]

        pitch_intelligence = None
        if deck and deck.filename:
            deck_bytes = await deck.read()
            if len(deck_bytes) > MAX_UPLOAD_MB * 1024 * 1024:
                raise HTTPException(413, f"Pitch deck exceeds the {MAX_UPLOAD_MB} MB upload limit.")
            with tempfile.NamedTemporaryFile(suffix=Path(deck.filename).suffix.lower(), delete=False) as f:
                f.write(deck_bytes)
                deck_path = Path(f.name)
            try:
                deck_data = extract_deck(deck_path)
                pitch = analyze_pitch(deck_data, selected)
                consistency = check_consistency(deck_data, selected or {})
                assessment = assess_investment(selected, pitch, consistency) if selected else None
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            except Exception as exc:
                raise HTTPException(422, f"Could not analyze pitch deck: {exc}") from exc
            pitch_intelligence = {
                "deck": {
                    "file_name": deck_data["file_name"],
                    "file_type": deck_data["file_type"],
                    "page_count": deck_data["page_count"],
                },
                "pitch_analysis": pitch,
                "consistency_check": consistency,
                "investment_assessment": assessment,
            }

        result["pitch_intelligence"] = pitch_intelligence
        result["startup"] = selected
        result["workspace_message"] = "Analysis complete. This dataset is now the active VentureIQ workspace."

        global _ACTIVE_DATASET, _WORKSPACE_LOADED_AT
        with _workspace_lock:
            _ACTIVE_DATASET = result
            _WORKSPACE_LOADED_AT = datetime.now(timezone.utc).isoformat()
        return result
    finally:
        for p in (dataset_path, deck_path):
            if p and p.exists():
                p.unlink()


# The frontend is deliberately zero-build and zero-Node so the project can be
# run reliably with one Python command. Mounting is done after API routes so
# /docs, /redoc and /openapi.json keep their FastAPI behavior.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
