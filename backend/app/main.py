from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_NAME, APP_VERSION, DATASET_PATH
from app.routes import claims, dashboard, prediction, providers


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Real-time insurance claim fraud risk detection API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "ClaimShield AI backend is running",
        "dataset_found": DATASET_PATH.exists(),
        "dataset_path": str(DATASET_PATH),
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
    }


app.include_router(dashboard.router)
app.include_router(claims.router)
app.include_router(providers.router)
app.include_router(prediction.router)
