"""Dataset ingestion and deterministic VentureIQ analysis."""
from __future__ import annotations

from pathlib import Path
from typing import Any
import math
import re
import pandas as pd

from .scoring import score_startup

COLUMN_ALIASES = {
    "startup id": "Startup_ID", "startup_id": "Startup_ID", "id": "Startup_ID",
    "startup name": "Startup_Name", "startup_name": "Startup_Name", "company": "Startup_Name", "company name": "Startup_Name",
    "industry": "Industry", "sector": "Industry", "vertical": "Industry",
    "stage": "Funding_Stage", "funding stage": "Funding_Stage",
    "revenue": "Revenue", "revenue growth": "Revenue_Growth", "growth": "Revenue_Growth",
    "gross margin": "Gross_Margin", "net margin": "Net_Margin",
    "customers": "Customers", "customer growth": "Customer_Growth", "retention": "Retention",
    "tam": "TAM", "sam": "SAM", "som": "SOM", "market growth": "Market_Growth",
    "competition intensity": "Competition_Intensity", "competition": "Competition_Intensity",
    "team size": "Team_Size", "team": "Team_Size", "founder count": "Founder_Count",
    "founder experience": "Founder_Experience", "technology readiness": "Technology_Readiness",
    "funding required": "Funding_Required", "equity offered": "Equity_Offered",
    "ask valuation": "Ask_Valuation", "valuation": "Valuation", "debt": "Debt",
    "cash runway": "Cash_Runway", "funding raised": "Funding_Raised", "raised": "Funding_Raised",
    "location": "Location", "business model": "Business_Model",
    "deal status": "Deal_Status", "ip protected": "IP_Protected", "deal valuation": "Deal_Valuation",
}
TEXT_COLUMNS = {
    "Startup_ID", "Startup_Name", "Industry", "Business_Model", "Location",
    "Funding_Stage", "Deal_Status", "Founder_Name", "Founders", "Founder_Experience_Text",
}
NUMERIC_HINTS = {
    "Revenue", "Revenue_Growth", "Gross_Margin", "Net_Margin", "Customers", "Customer_Growth", "Retention",
    "TAM", "SAM", "SOM", "Market_Growth", "Competition_Intensity", "Team_Size", "Founder_Count",
    "Founder_Experience", "Technology_Readiness", "Funding_Required", "Equity_Offered", "Ask_Valuation",
    "Valuation", "Debt", "Cash_Runway", "Funding_Raised", "IP_Protected", "Deal_Valuation",
}


def _canonicalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename: dict[Any, str] = {}
    seen: set[str] = set()
    for col in df.columns:
        key = str(col).strip().lower().replace("_", " ")
        target = COLUMN_ALIASES.get(key, str(col).strip())
        if target in seen:
            target = f"{target}_{len(seen)}"
        seen.add(target)
        rename[col] = target
    return df.rename(columns=rename).copy()


def _parse_number(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    percent = text.endswith("%")
    text = re.sub(r"^[₹$€£]\s*", "", text).replace("%", "")
    multiplier = 1.0
    if text.lower().endswith("b"):
        multiplier = 1_000_000_000
        text = text[:-1]
    elif text.lower().endswith("m"):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.lower().endswith("k"):
        multiplier = 1_000
        text = text[:-1]
    try:
        number = float(text)
    except ValueError:
        return None
    return number * multiplier


def load_dataset(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    suffix = path.suffix.lower()
    try:
        if suffix == ".csv":
            df = pd.read_csv(path)
        elif suffix == ".xlsx":
            df = pd.read_excel(path, engine="openpyxl")
        elif suffix == ".xls":
            df = pd.read_excel(path, engine="xlrd")
        else:
            raise ValueError("Unsupported dataset format. Use CSV, XLSX, or XLS.")
    except pd.errors.EmptyDataError as exc:
        raise ValueError("Dataset contains no readable rows or columns.") from exc
    except Exception as exc:
        raise ValueError(f"Could not read the dataset: {exc}") from exc

    if df.empty:
        raise ValueError("Dataset contains no startup rows.")

    df = _canonicalize_columns(df)
    if "Startup_Name" not in df.columns:
        df["Startup_Name"] = [f"Startup {i + 1}" for i in range(len(df))]
    if "Industry" not in df.columns:
        df["Industry"] = "Unclassified"
    if "Startup_ID" not in df.columns:
        df.insert(0, "Startup_ID", [f"VQ-{i + 1:04d}" for i in range(len(df))])
    else:
        raw_ids = df["Startup_ID"].astype(str).replace({"nan": ""})
        used: set[str] = set()
        fixed: list[str] = []
        for i, value in enumerate(raw_ids):
            candidate = value.strip() or f"VQ-{i + 1:04d}"
            if candidate in used:
                base = candidate
                n = 2
                while f"{base}-{n}" in used:
                    n += 1
                candidate = f"{base}-{n}"
            used.add(candidate)
            fixed.append(candidate)
        df["Startup_ID"] = fixed

    for col in df.columns:
        if col in TEXT_COLUMNS:
            df[col] = df[col].where(df[col].notna(), None)
            continue
        if col in NUMERIC_HINTS or df[col].dtype != "object":
            parsed = df[col].map(_parse_number)
            if parsed.notna().sum() >= max(1, int(len(df) * 0.5)):
                df[col] = parsed

    return df


def _json_safe(value: Any) -> Any:
    if pd.isna(value) if not isinstance(value, (dict, list, tuple)) else False:
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def analyze_dataframe(df: pd.DataFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        record = {str(k): _json_safe(v) for k, v in row.to_dict().items()}
        record["score"] = score_startup(record)
        records.append(record)
    return records


def run_ventureiq(path: str | Path) -> dict[str, Any]:
    df = load_dataset(path)
    records = analyze_dataframe(df)
    missing_required = [name for name in ["Startup_Name", "Industry"] if name not in df.columns]
    return {
        "status": "ok",
        "rows_analyzed": len(records),
        "columns": list(df.columns),
        "data_quality": {
            "rows": len(df),
            "columns": len(df.columns),
            "missing_cells": int(df.isna().sum().sum()),
            "duplicate_rows": int(df.duplicated().sum()),
            "duplicate_startup_ids": int(df["Startup_ID"].duplicated().sum()),
            "generated_startup_names": "Startup_Name" not in df.columns,
            "warnings": missing_required,
        },
        "startups": records,
    }
