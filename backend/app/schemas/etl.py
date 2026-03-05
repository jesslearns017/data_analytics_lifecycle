from __future__ import annotations

from pydantic import BaseModel


class ColumnTreatment(BaseModel):
    column: str
    # Missing value handling
    missing_strategy: str | None = None  # drop_rows, fill_mean, fill_median, fill_mode, fill_value, fill_ffill, fill_unknown
    fill_value: str | None = None
    # Outlier handling
    outlier_strategy: str | None = None  # none, clip_iqr, remove
    # Encoding
    encoding: str | None = None  # none, onehot, label, ordinal
    # Scaling
    scaling: str | None = None  # none, standard, minmax
    # Drop column entirely
    drop: bool = False
    # Human-readable recommendation remarks
    recommendation: str | None = None


class ETLPlan(BaseModel):
    drop_duplicates: bool = True
    treatments: list[ColumnTreatment]
    target_column: str | None = None
    dataset_type: str | None = None


class ETLPlanRequest(BaseModel):
    profile: dict  # The profile JSON from /profile endpoint
    dataset_type: str | None = None
    target_column: str | None = None


class TreatmentLog(BaseModel):
    column: str
    action: str
    detail: str


class ETLApplyResponse(BaseModel):
    rows_before: int
    rows_after: int
    cols_before: int
    cols_after: int
    treatments_applied: list[TreatmentLog]
    cleaned_csv_base64: str
    preview_rows: list[dict] | None = None
    column_names: list[str] | None = None
