import pandas as pd

from app.config import DATASET_CSV_PATH, DATASET_PATH


def main():
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

    print("Reading Excel dataset. This can take a minute...")
    df = pd.read_excel(DATASET_PATH)

    print(f"Rows: {len(df)}")
    print(f"Columns: {len(df.columns)}")
    print(f"Saving faster CSV cache to: {DATASET_CSV_PATH}")
    df.to_csv(DATASET_CSV_PATH, index=False)
    print("Done. Backend will now load the CSV cache faster.")


if __name__ == "__main__":
    main()
