from io import BytesIO
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

CSV = b"Startup_ID,Startup_Name,Industry,Funding_Stage,Revenue_Growth,Customers,Retention,Technology_Readiness\n1,Test Venture,FinTech,Seed,80,10000,90,9\n2,Second Venture,HealthTech,Series A,40,3000,80,8\n"


def reset():
    client.post("/api/reset")


def test_health_and_docs():
    assert client.get("/api/health").status_code == 200
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_clean_slate_and_summary():
    reset()
    assert client.get("/api/startups").json()["total"] == 0
    assert client.get("/api/summary").json()["startup_count"] == 0
    meta = client.get("/api/meta").json()
    assert meta["workspace_state"] == "empty"
    assert meta["sample_dataset_available"] is False


def test_upload_populates_workspace_and_details_work():
    reset()
    response = client.post(
        "/api/analyze",
        files={"dataset": ("test.csv", BytesIO(CSV), "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["rows_analyzed"] == 2
    assert body["startups"][0]["Startup_ID"] == "1"

    listing = client.get("/api/startups?page_size=100").json()
    assert listing["total"] == 2
    assert len(listing["items"]) == 2
    startup_id = listing["items"][0]["startup_id"]
    assert client.get(f"/api/startups/{startup_id}").status_code == 200
    assert client.get("/api/summary").json()["startup_count"] == 2


def test_filters_and_scoring():
    client.post("/api/reset")
    client.post("/api/analyze", files={"dataset": ("test.csv", BytesIO(CSV), "text/csv")})
    assert client.get("/api/startups?industry=FinTech").json()["total"] == 1
    assert client.get("/api/startups?min_score=0").json()["total"] == 2
    scoring = client.get("/api/scoring").json()
    assert round(sum(scoring["weights"].values()), 6) == 1


def test_reset_clears_workspace():
    client.post("/api/reset")
    assert client.get("/api/startups").json()["total"] == 0
    assert client.post("/api/reset").json()["workspace_state"] == "empty"
