from pathlib import Path
import os

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
OUTPUT_DIR = ROOT_DIR / "output"
FRONTEND_DIR = ROOT_DIR / "frontend"
MAX_UPLOAD_MB = int(os.getenv("VQ_MAX_UPLOAD_MB", "25"))
CORS_ORIGINS = [x.strip() for x in os.getenv(
    "VQ_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",") if x.strip()]
