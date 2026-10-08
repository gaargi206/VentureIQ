"""Deterministic VentureIQ scoring engine.

The scoring model is intentionally inspectable: every category has a
named formula, normalized 0-100 component scores, and a fixed weight.
This makes the API output reproducible and suitable for a UI that shows
why a score was produced.
"""
from __future__ import annotations
from typing import Any
import math

WEIGHTS = {
    "Market Opportunity": 0.15,
    "Problem Validation": 0.10,
    "Product / Solution": 0.10,
    "Competitive Advantage": 0.10,
    "Business Model": 0.10,
    "Financial Potential": 0.15,
    "Scalability": 0.10,
    "Management / Team": 0.10,
    "Risk": 0.05,
    "Exit Potential": 0.05,
}

def _num(row: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = row.get(key, default)
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default

def _clip(v: float) -> float:
    return max(0.0, min(100.0, v))

def _pct(v: float, target: float) -> float:
    return _clip(v / target * 100) if target else 0.0

def score_startup(row: dict[str, Any]) -> dict[str, Any]:
    revenue_growth = _num(row, "Revenue_Growth")
    gross_margin = _num(row, "Gross_Margin")
    net_margin = _num(row, "Net_Margin")
    market_growth = _num(row, "Market_Growth")
    tam, sam, som = (_num(row, x) for x in ("TAM", "SAM", "SOM"))
    competition = _num(row, "Competition_Intensity")
    customers = _num(row, "Customers")
    customer_growth = _num(row, "Customer_Growth")
    retention = _num(row, "Retention")
    tech = _num(row, "Technology_Readiness")
    founders = _num(row, "Founder_Count")
    experience = _num(row, "Founder_Experience")
    team = _num(row, "Team_Size")
    runway = _num(row, "Cash_Runway")
    debt = _num(row, "Debt")
    valuation = _num(row, "Valuation")
    revenue = _num(row, "Revenue")
    ip = _num(row, "IP_Protected")
    funding_required = _num(row, "Funding_Required")
    ask = _num(row, "Ask_Valuation")
    deal_val = _num(row, "Deal_Valuation")

    market = _clip(0.35 * _pct(market_growth, 25) +
                    0.35 * _pct(sam / max(tam, 1) * 100, 40) +
                    0.30 * _pct(som / max(sam, 1) * 100, 30))
    problem = _clip(0.45 * _pct(customer_growth, 70) +
                    0.35 * _pct(retention, 90) +
                    0.20 * _pct(customers, 50000))
    product = _clip(0.55 * _pct(tech, 10) + 0.25 * _pct(retention, 95) + 0.20 * (100 if ip else 35))
    advantage = _clip(0.50 * (100 - competition) + 0.30 * (100 if ip else 25) + 0.20 * _pct(experience, 15))
    business = _clip(0.50 * _pct(gross_margin, 70) + 0.30 * _pct(revenue_growth, 60) + 0.20 * _pct(retention, 90))
    financial = _clip(0.30 * _pct(revenue_growth, 80) + 0.25 * _pct(gross_margin, 70) +
                      0.20 * _pct(runway, 12) + 0.15 * _pct(revenue, 250_000_000) +
                      0.10 * _clip(50 + net_margin))
    scalability = _clip(0.40 * _pct(customer_growth, 80) + 0.30 * _pct(market_growth, 30) +
                        0.30 * _pct(tech, 10))
    team_score = _clip(0.35 * _pct(experience, 15) + 0.25 * _pct(team, 75) +
                       0.20 * _pct(founders, 4) + 0.20 * _pct(retention, 90))
    risk_penalty = _clip(0.45 * competition + 0.25 * (100 - _pct(runway, 12)) +
                         0.20 * _clip(debt / max(valuation, 1) * 100) +
                         0.10 * (100 if net_margin < 0 else 20))
    risk = _clip(100 - risk_penalty)
    exit = _clip(0.35 * _pct(revenue, 500_000_000) + 0.30 * _pct(revenue_growth, 70) +
                 0.20 * (100 if ip else 30) + 0.15 * _pct(valuation, 1_000_000_000))

    scores = {
        "Market Opportunity": market,
        "Problem Validation": problem,
        "Product / Solution": product,
        "Competitive Advantage": advantage,
        "Business Model": business,
        "Financial Potential": financial,
        "Scalability": scalability,
        "Management / Team": team_score,
        "Risk": risk,
        "Exit Potential": exit,
    }
    overall = sum(scores[k] * WEIGHTS[k] for k in WEIGHTS)
    completeness_fields = [
        "Revenue","Revenue_Growth","Gross_Margin","Market_Growth","TAM","SAM","SOM",
        "Customers","Customer_Growth","Retention","Technology_Readiness","Founder_Experience",
        "Cash_Runway","Valuation","Funding_Required","Ask_Valuation"
    ]
    present = sum(1 for k in completeness_fields if row.get(k) not in (None, "", "nan"))
    completeness = round(present / len(completeness_fields) * 100, 1)

    flags=[]
    if runway < 3: flags.append("Cash runway below 3 months")
    if net_margin < 0: flags.append("Negative net margin")
    if competition >= 80: flags.append("High competitive intensity")
    if debt > max(valuation * 0.20, 0) and valuation: flags.append("Debt is material relative to valuation")
    if ask and revenue and ask / revenue > 12: flags.append("High ask valuation / revenue multiple")
    risk_score = round(100 - risk, 1)
    category = "Strong Candidate" if overall >= 80 and risk_score < 30 else \
               "Watchlist" if overall >= 65 and risk_score < 45 else \
               "Further Diligence" if overall >= 50 else "High Risk"

    return {
        "attractiveness_score": round(overall, 1),
        "risk_score": risk_score,
        "risk_level": "Low" if risk_score < 25 else "Medium" if risk_score < 45 else "High",
        "investment_category": category,
        "completeness": completeness,
        "weight_coverage": 100.0,
        "category_scores": [
            {"category": k, "score": round(scores[k],1), "weight": WEIGHTS[k],
             "weighted_score": round(scores[k]*WEIGHTS[k],1)}
            for k in WEIGHTS
        ],
        "red_flags": flags,
    }
