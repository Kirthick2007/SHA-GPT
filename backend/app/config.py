from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

DATASET_PATH = DATA_DIR / "cleaned_insurance_hackathon_ready.xlsx"
DATASET_CSV_PATH = DATA_DIR / "cleaned_insurance_hackathon_ready.csv"
APP_NAME = "ClaimShield AI"
APP_VERSION = "1.0.0"
