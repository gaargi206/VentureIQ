def assess_investment(startup: dict, pitch_analysis=None, consistency_result=None):
    score=startup["score"]
    pitch=(pitch_analysis or {}).get("overall_pitch_score")
    consistency=(consistency_result or {}).get("consistency_score")
    final=score["attractiveness_score"]
    if pitch is not None:
        final=round(final*0.8+pitch*0.2,1)
    reasons=[]
    if final>=80: reasons.append("Strong overall attractiveness score")
    if score["completeness"]<75: reasons.append("Material data gaps remain")
    if score["red_flags"]: reasons.append(f"{len(score['red_flags'])} deterministic risk flag(s) require diligence")
    if consistency is not None and consistency<60: reasons.append("Pitch-to-data evidence coverage is limited")
    return {
        "attractiveness_score":final,
        "risk_score":score["risk_score"],
        "risk_level":score["risk_level"],
        "investment_category":score["investment_category"],
        "completeness":score["completeness"],
        "weight_coverage":score["weight_coverage"],
        "reasons":reasons,
        "due_diligence_actions":["Validate primary financial statements","Verify customer and retention claims",
                                 "Reconcile fundraising ask with cap table and valuation"],
    }
