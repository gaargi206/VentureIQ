import re

CRITERIA = {
    "Problem Clarity": ["problem","pain","challenge","underserved","inefficient"],
    "Solution Strength": ["solution","platform","product","technology","workflow"],
    "Market Opportunity": ["tam","sam","som","market","billion","million"],
    "Product / Technology": ["technology","ai","machine learning","software","prototype","api"],
    "Business Model": ["revenue model","subscription","saas","commission","pricing"],
    "Traction": ["revenue","customers","growth","users","retention","gmv"],
    "Financial Quality": ["margin","ebitda","burn","runway","cash","profit"],
    "Growth Potential": ["growth","expansion","market","customers","retention"],
    "Competitive Position": ["competitor","competition","moat","ip","advantage"],
    "Team Strength": ["founder","team","experience","advisor","cofounder"],
    "Fundraising Logic": ["funding","raise","valuation","equity","ask","investment"],
}

def _normalize(s): return re.sub(r"[^a-z0-9 ]+"," ",s.lower()).strip()

def analyze_pitch(deck: dict, startup: dict | None = None) -> dict:
    text=_normalize(deck.get("text",""))
    results=[]
    for label, keywords in CRITERIA.items():
        matches=[k for k in keywords if k in text]
        score=min(100, len(matches)/max(1,len(keywords))*100)
        results.append({
            "criterion":label,
            "score":round(score),
            "confidence":"High" if len(matches)>=3 else "Medium" if len(matches)>=1 else "Low",
            "matched_keywords":matches,
            "evidence_pages":[p["page"] for p in deck["pages"] if any(k in _normalize(p["text"]) for k in keywords)],
        })
    avg=round(sum(x["score"] for x in results)/len(results),1)
    return {"overall_pitch_score":avg,"criteria":results}
