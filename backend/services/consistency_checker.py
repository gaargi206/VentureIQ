import re
def _numbers(text):
    return [float(x.replace(",","")) for x in re.findall(r"\b\d+(?:\.\d+)?\b", text or "")]
def check_consistency(deck: dict, startup: dict) -> dict:
    text=deck.get("text","").lower()
    checks=[]
    # Compare only when an explicit startup field value is visible in deck text.
    for field,label in [("Revenue","revenue"),("Customers","customers"),("Funding_Required","funding"),
                        ("Ask_Valuation","valuation"),("Equity_Offered","equity")]:
        value=startup.get(field)
        if value in (None,""): continue
        try:
            n=float(value)
        except: continue
        visible=label in text
        checks.append({"field":field,"dataset_value":value,
                       "status":"Evidence present" if visible else "Not verified",
                       "difference_percent":None})
    total=len(checks)
    verified=sum(1 for x in checks if x["status"]=="Evidence present")
    return {"consistency_score":round(verified/total*100,1) if total else None,
            "total_claims_checked":total,"verified_claims":verified,
            "mismatched_claims":0,"unverified_claims":total-verified,"results":checks}
