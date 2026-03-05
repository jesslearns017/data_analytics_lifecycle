from __future__ import annotations

from pydantic import BaseModel


class TopValue(BaseModel):
    value: str
    count: int


class NumericSummary(BaseModel):
    mean: float
    median: float
    std: float
    min: float
    max: float


class OutlierEstimate(BaseModel):
    count: int
    pct: float


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    nulls_count: int
    nulls_pct: float
    n_unique: int
    top_values: list[TopValue] | None = None
    numeric_summary: NumericSummary | None = None
    outlier_estimate: OutlierEstimate | None = None
    datetime_candidate: bool = False


class CorrelationMatrix(BaseModel):
    columns: list[str]
    matrix: list[list[float]]


class TimeSeries(BaseModel):
    datetime_candidates: list[str]
    selected_time_col: str | None = None
    inferred_frequency: str | None = None


class DatasetTypeDetection(BaseModel):
    detected_type: str  # time_series, classification, regression, transactional, panel, tabular
    suggested_target: str | None = None
    suggested_time_col: str | None = None
    suggested_entity_col: str | None = None
    type_reason: str | None = None
    target_reason: str | None = None


class ProfileResponse(BaseModel):
    rows: int
    cols: int
    duplicates_count: int
    columns: list[ColumnProfile]
    correlation: CorrelationMatrix | None = None
    time_series: TimeSeries
    dataset_type: DatasetTypeDetection
    preview_rows: list[dict] | None = None
    column_names: list[str] | None = None
    schema_inferred: dict[str, str] | None = None
