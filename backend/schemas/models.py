from typing import Any
from pydantic import BaseModel


class StartupSummary(BaseModel):
    startup_id: str
    name: str
    industry: str
    stage: str | None = None
    location: str | None = None
    attractiveness_score: float
    risk_score: float
    risk_level: str
    investment_category: str
    revenue: float | None = None
    funding_raised: float | None = None
    revenue_growth: float | None = None
    customers: float | None = None


class StartupListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    filters: dict[str, Any]
    items: list[StartupSummary]


class AnalyzeResponse(BaseModel):
    status: str
    rows_analyzed: int
    columns: list[str]
    data_quality: dict[str, Any]
    startups: list[dict[str, Any]]
    startup: dict[str, Any] | None = None
    pitch_intelligence: dict[str, Any] | None = None
    workspace_message: str | None = None
