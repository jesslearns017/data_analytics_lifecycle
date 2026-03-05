from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd

from app.schemas.profiling import (
    ColumnProfile,
    CorrelationMatrix,
    DatasetTypeDetection,
    NumericSummary,
    OutlierEstimate,
    ProfileResponse,
    TimeSeries,
    TopValue,
)


def _read_file(content: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel bytes into a DataFrame."""
    lower = filename.lower()
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return pd.read_excel(io.BytesIO(content), engine="openpyxl")
    # Default to CSV
    return pd.read_csv(io.BytesIO(content))


def _detect_datetime_candidates(df: pd.DataFrame) -> list[str]:
    """Identify columns that can be parsed as datetime."""
    candidates: list[str] = []
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            candidates.append(str(col))
            continue
        if df[col].dtype == object:
            sample = df[col].dropna().head(50)
            if len(sample) == 0:
                continue
            try:
                parsed = pd.to_datetime(sample, infer_datetime_format=True)
                if parsed.notna().sum() / len(sample) > 0.8:
                    candidates.append(str(col))
            except Exception:
                pass
    return candidates


def _outlier_estimate(series: pd.Series) -> OutlierEstimate:
    """IQR-based outlier count."""
    clean = series.dropna()
    if len(clean) < 4:
        return OutlierEstimate(count=0, pct=0.0)
    q1 = float(clean.quantile(0.25))
    q3 = float(clean.quantile(0.75))
    iqr = q3 - q1
    if iqr == 0:
        return OutlierEstimate(count=0, pct=0.0)
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    outliers = int(((clean < lower) | (clean > upper)).sum())
    pct = round(outliers / len(clean) * 100, 2) if len(clean) > 0 else 0.0
    return OutlierEstimate(count=outliers, pct=pct)


def _profile_column(df: pd.DataFrame, col: str, datetime_candidates: list[str]) -> ColumnProfile:
    """Build profile for a single column."""
    series = df[col]
    nulls_count = int(series.isna().sum())
    total = len(series)
    nulls_pct = round(nulls_count / total * 100, 2) if total > 0 else 0.0
    n_unique = int(series.nunique())
    dtype_str = str(series.dtype)

    top_values = None
    numeric_summary = None
    outlier_est = None

    if pd.api.types.is_numeric_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            numeric_summary = NumericSummary(
                mean=round(float(clean.mean()), 4),
                median=round(float(clean.median()), 4),
                std=round(float(clean.std()), 4),
                min=round(float(clean.min()), 4),
                max=round(float(clean.max()), 4),
            )
        outlier_est = _outlier_estimate(series)
    else:
        vc = series.value_counts().head(5)
        top_values = [TopValue(value=str(idx), count=int(cnt)) for idx, cnt in vc.items()]

    return ColumnProfile(
        name=str(col),
        dtype=dtype_str,
        nulls_count=nulls_count,
        nulls_pct=nulls_pct,
        n_unique=n_unique,
        top_values=top_values,
        numeric_summary=numeric_summary,
        outlier_estimate=outlier_est,
        datetime_candidate=str(col) in datetime_candidates,
    )


def _compute_correlation(df: pd.DataFrame) -> CorrelationMatrix | None:
    """Correlation matrix for numeric columns."""
    num_cols = df.select_dtypes(include="number").columns.tolist()
    if len(num_cols) < 2:
        return None
    corr = df[num_cols].corr()
    # Replace NaN with 0 for JSON serialization
    corr = corr.fillna(0)
    return CorrelationMatrix(
        columns=[str(c) for c in corr.columns],
        matrix=[[round(float(v), 4) for v in row] for row in corr.values],
    )


def _detect_dataset_type(
    df: pd.DataFrame,
    datetime_candidates: list[str],
) -> DatasetTypeDetection:
    """Auto-classify the dataset type."""
    num_cols = df.select_dtypes(include="number").columns.tolist()
    cat_cols = df.select_dtypes(include="object").columns.tolist()
    total_rows = len(df)

    # Compute unique ratios
    unique_ratios = {col: df[col].nunique() / max(1, total_rows) for col in df.columns}

    # Entity columns: moderate cardinality, at least 3 unique values
    entity_cols = [
        c for c in cat_cols
        if 0.01 < unique_ratios.get(c, 0) < 0.3
        and df[c].nunique() >= 3
    ]

    # High cardinality columns
    high_card_cols = [
        c for c in cat_cols
        if unique_ratios.get(c, 0) > 0.5
    ]

    # Check for panel data — need entity cols AND repeated time values per entity
    if datetime_candidates and entity_cols:
        time_col = datetime_candidates[0]
        ent_col = entity_cols[0]
        # Panel data: a substantial fraction of time values must repeat
        try:
            time_vals = pd.to_datetime(df[time_col], errors="coerce").dropna()
            dup_ratio = time_vals.duplicated().sum() / max(1, len(time_vals))
            is_panel = dup_ratio > 0.2  # >20% duplicated times
        except Exception:
            is_panel = False
        if is_panel:
            return DatasetTypeDetection(
                detected_type="panel",
                suggested_time_col=time_col,
                suggested_entity_col=ent_col,
                type_reason=f"Found datetime column '{time_col}' and entity column '{ent_col}' with >20% repeated time values per entity, indicating panel (multi-entity time series) data.",
            )

    # Check for classification target (before time series — a dataset with
    # a clear low-cardinality target and many feature columns is classification,
    # even if it contains a date field)
    _target_hints = {"target", "label", "class", "churn", "outcome", "y", "survived"}
    candidate_targets = [
        c for c in df.columns
        if 2 <= df[c].nunique() <= 10 and not pd.api.types.is_numeric_dtype(df[c])
    ]
    # Also check numeric cols with low cardinality (binary, etc.)
    candidate_targets += [
        c for c in num_cols
        if 2 <= df[c].nunique() <= 10
    ]
    # Prefer columns whose name looks like a target, else fall back to last column
    hint_matches = [c for c in candidate_targets if str(c).lower() in _target_hints]
    if candidate_targets:
        target = hint_matches[0] if hint_matches else candidate_targets[-1]
        n_unique = int(df[target].nunique())
        unique_vals = ", ".join([str(v) for v in df[target].dropna().unique()[:6]])
        if hint_matches:
            t_reason = f"Column '{target}' was selected because its name matches a common target keyword (target, label, class, churn, outcome, survived). It has {n_unique} unique values: [{unique_vals}]."
        else:
            t_reason = f"Column '{target}' was selected because it has only {n_unique} unique values [{unique_vals}], making it a natural categorical target. It was the last qualifying column in the dataset."
        return DatasetTypeDetection(
            detected_type="classification",
            suggested_target=str(target),
            type_reason=f"Detected as classification because column '{target}' has {n_unique} unique categorical values (between 2 and 10), which is characteristic of a classification target.",
            target_reason=t_reason,
        )

    # Check for time series (datetime with high unique ratio and few value columns)
    if datetime_candidates:
        time_col = datetime_candidates[0]
        non_dt_cols = [c for c in df.columns if c not in datetime_candidates]
        is_time_like = unique_ratios.get(time_col, 0) > 0.9 or pd.api.types.is_datetime64_any_dtype(df[time_col])
        if is_time_like:
            return DatasetTypeDetection(
                detected_type="time_series",
                suggested_time_col=time_col,
                type_reason=f"Detected as time series because column '{time_col}' contains datetime values with >90% unique entries, indicating sequential temporal data.",
            )

    # Check for regression
    if len(num_cols) > len(cat_cols):
        reg_target = str(num_cols[-1]) if num_cols else None
        return DatasetTypeDetection(
            detected_type="regression",
            suggested_target=reg_target,
            type_reason=f"Detected as regression because the dataset has more numeric columns ({len(num_cols)}) than categorical ones ({len(cat_cols)}), and no clear classification target was found.",
            target_reason=f"Column '{reg_target}' was selected as the target because it is the last numeric column in the dataset. In the absence of a column with a known target name, the last numeric column is assumed to be the dependent variable." if reg_target else None,
        )

    # Check for transactional
    if len(high_card_cols) > 1 and datetime_candidates:
        return DatasetTypeDetection(
            detected_type="transactional",
            type_reason=f"Detected as transactional because there are {len(high_card_cols)} high-cardinality columns and datetime data, typical of event/transaction logs.",
        )

    return DatasetTypeDetection(
        detected_type="tabular",
        type_reason="No strong signal for classification, regression, or time series was found. The dataset is treated as general tabular data.",
    )


def profile_dataset(content: bytes, filename: str) -> ProfileResponse:
    """Full profiling pipeline: read file, profile columns, detect type."""
    df = _read_file(content, filename)

    datetime_candidates = _detect_datetime_candidates(df)

    col_profiles = [_profile_column(df, col, datetime_candidates) for col in df.columns]
    correlation = _compute_correlation(df)
    dataset_type = _detect_dataset_type(df, datetime_candidates)

    duplicates_count = int(df.duplicated().sum())

    # Inferred schema
    schema = {str(col): str(df[col].dtype) for col in df.columns}

    # Preview rows (first 50)
    preview = df.head(50).replace({np.nan: None}).to_dict(orient="records")

    # Time series info
    time_info = TimeSeries(
        datetime_candidates=datetime_candidates,
        selected_time_col=dataset_type.suggested_time_col,
    )

    return ProfileResponse(
        rows=len(df),
        cols=len(df.columns),
        duplicates_count=duplicates_count,
        columns=col_profiles,
        correlation=correlation,
        time_series=time_info,
        dataset_type=dataset_type,
        preview_rows=preview,
        column_names=[str(c) for c in df.columns],
        schema_inferred=schema,
    )
