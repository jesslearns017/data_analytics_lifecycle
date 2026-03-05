from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
import pandas as pd

from app.schemas.etl import (
    ColumnTreatment,
    ETLApplyResponse,
    ETLPlan,
    TreatmentLog,
)
from app.services.profiling_service import _read_file


# ---------------------------------------------------------------------------
# Health Score (v2 — 5 categories, each 0-20, total 0-100)
# ---------------------------------------------------------------------------

def compute_health_score(df: pd.DataFrame) -> dict[str, Any]:
    """Return a dict with total score and per-category breakdown."""
    total_cells = df.shape[0] * df.shape[1]
    if df.shape[0] < 10 or df.shape[1] < 1 or total_cells == 0:
        return {
            "total": None,
            "insufficient_data": True,
            "completeness": 0,
            "consistency": 0,
            "statistical_integrity": 0,
            "feature_usefulness": 0,
            "modeling_readiness": 0,
        }

    # 1. Completeness (0-20)
    missing_ratio = float(df.isna().sum().sum()) / total_cells
    completeness = 20.0 * (1.0 - missing_ratio)

    # 2. Consistency (0-20)
    dup_ratio = float(df.duplicated().sum()) / max(1, df.shape[0])
    # Mixed-type columns: columns with object dtype that contain mixed numeric/string
    mixed_type_count = 0
    for col in df.select_dtypes(include="object").columns:
        sample = df[col].dropna().head(200)
        if len(sample) == 0:
            continue
        num_count = pd.to_numeric(sample, errors="coerce").notna().sum()
        if 0 < num_count < len(sample):
            mixed_type_count += 1
    consistency = max(0.0, 20.0 * (1.0 - dup_ratio) - (mixed_type_count * 2))

    # 3. Statistical Integrity (0-20)
    num_cols = df.select_dtypes(include="number")
    outlier_cells = 0
    zero_var_count = 0
    total_num_cells = num_cols.shape[0] * num_cols.shape[1] if num_cols.shape[1] > 0 else 1
    for col in num_cols.columns:
        clean = num_cols[col].dropna()
        if len(clean) < 4:
            continue
        if clean.std() == 0:
            zero_var_count += 1
            continue
        q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
        iqr = q3 - q1
        if iqr > 0:
            outlier_cells += int(((clean < q1 - 1.5 * iqr) | (clean > q3 + 1.5 * iqr)).sum())
    outlier_ratio = outlier_cells / max(1, total_num_cells)
    statistical_integrity = max(0.0, 20.0 * (1.0 - outlier_ratio) - (zero_var_count * 3))

    # 4. Feature Usefulness (0-20)
    usefulness_scores: list[float] = []
    for col in df.columns:
        series = df[col].dropna()
        if len(series) == 0:
            usefulness_scores.append(0.0)
            continue
        if pd.api.types.is_numeric_dtype(series):
            # Use coefficient of variation
            mean = series.mean()
            std = series.std()
            if mean != 0 and std > 0:
                cv = min(abs(std / mean), 3.0) / 3.0  # Normalize to [0, 1]
                usefulness_scores.append(cv)
            else:
                usefulness_scores.append(0.0)
        else:
            # Use normalized entropy
            vc = series.value_counts(normalize=True)
            if len(vc) <= 1:
                usefulness_scores.append(0.0)
            else:
                entropy = float(-(vc * np.log2(vc.clip(lower=1e-10))).sum())
                max_entropy = np.log2(len(vc))
                usefulness_scores.append(entropy / max_entropy if max_entropy > 0 else 0.0)
    avg_usefulness = float(np.mean(usefulness_scores)) if usefulness_scores else 0.0
    feature_usefulness = 20.0 * avg_usefulness

    # 5. Modeling Readiness (0-20) — simplified (VIF is expensive, defer full calc)
    modeling_readiness = 20.0
    # Penalty for constant columns
    for col in df.columns:
        if df[col].nunique() <= 1:
            modeling_readiness -= 3.0
    modeling_readiness = max(0.0, modeling_readiness)

    total = round(completeness + consistency + statistical_integrity + feature_usefulness + modeling_readiness, 1)
    total = max(0.0, min(100.0, total))

    return {
        "total": total,
        "insufficient_data": False,
        "completeness": round(completeness, 1),
        "consistency": round(consistency, 1),
        "statistical_integrity": round(statistical_integrity, 1),
        "feature_usefulness": round(feature_usefulness, 1),
        "modeling_readiness": round(modeling_readiness, 1),
    }


# ---------------------------------------------------------------------------
# Plan recommendation
# ---------------------------------------------------------------------------

def recommend_plan(profile: dict, dataset_type: str | None = None, target_column: str | None = None) -> ETLPlan:
    """Generate a recommended ETL plan from a profile dict."""
    columns: list[dict] = profile.get("columns", [])
    detected_type = dataset_type or profile.get("dataset_type", {}).get("detected_type", "tabular")
    suggested_target = target_column or profile.get("dataset_type", {}).get("suggested_target")
    time_col = profile.get("dataset_type", {}).get("suggested_time_col")

    treatments: list[ColumnTreatment] = []

    for col_info in columns:
        name = col_info["name"]
        dtype = col_info.get("dtype", "object")
        nulls_pct = col_info.get("nulls_pct", 0.0)
        n_unique = col_info.get("n_unique", 0)
        total_rows = profile.get("row_count", 0)
        outlier_est = col_info.get("outlier_estimate")
        is_numeric = dtype.startswith("int") or dtype.startswith("float")
        is_datetime = col_info.get("datetime_candidate", False)
        numeric_summary = col_info.get("numeric_summary")

        # Skip target column from scaling/encoding
        is_target = (name == suggested_target)

        # Default treatment
        t = ColumnTreatment(column=name)
        remarks: list[str] = []

        # --- Missing strategy ---
        if nulls_pct > 0:
            if nulls_pct > 60:
                t.drop = True
                t.recommendation = f"Drop recommended: {nulls_pct}% missing values — too sparse to impute reliably."
                treatments.append(t)
                continue
            if is_datetime or (detected_type == "time_series" and name == time_col):
                t.missing_strategy = "fill_ffill"
                remarks.append(f"Missing ({nulls_pct}%): Forward-fill recommended for time-ordered data to preserve temporal continuity.")
            elif is_numeric:
                t.missing_strategy = "fill_median"
                remarks.append(f"Missing ({nulls_pct}%): Median imputation recommended — robust to outliers unlike mean.")
            else:
                t.missing_strategy = "fill_unknown"
                remarks.append(f"Missing ({nulls_pct}%): Fill with 'Unknown' — preserves the fact that data was absent rather than guessing a category.")
        else:
            remarks.append("No missing values — no imputation needed.")

        # --- Outlier strategy ---
        if is_numeric and outlier_est and not is_target:
            outlier_pct = outlier_est.get("pct", 0) if isinstance(outlier_est, dict) else 0
            outlier_count = outlier_est.get("count", 0) if isinstance(outlier_est, dict) else 0
            if outlier_pct > 5:
                t.outlier_strategy = "clip_iqr"
                remarks.append(f"Outliers ({outlier_count} values, {outlier_pct}%): IQR clipping recommended — caps extreme values at Q1−1.5×IQR / Q3+1.5×IQR to reduce their influence without removing rows.")
            elif outlier_pct > 0:
                t.outlier_strategy = "none"
                remarks.append(f"Outliers ({outlier_count} values, {outlier_pct}%): Minor — no action needed. Consider clipping only if model performance is affected.")
            else:
                t.outlier_strategy = "none"
                remarks.append("No outliers detected (IQR method).")
        elif is_target:
            remarks.append("Target column — outlier handling skipped to preserve true label distribution.")

        # --- Encoding ---
        if not is_numeric and not is_datetime and not is_target:
            if n_unique <= 10:
                t.encoding = "onehot"
                remarks.append(f"Encoding: One-Hot recommended — {n_unique} unique categories (low cardinality). Creates binary columns for each category.")
            elif n_unique <= 30:
                t.encoding = "label"
                remarks.append(f"Encoding: Label encoding recommended — {n_unique} unique categories (moderate cardinality). Assigns integer codes; one-hot would create too many columns.")
            else:
                t.encoding = "onehot"
                remarks.append(f"Encoding: One-Hot with rare-category grouping — {n_unique} unique categories (high cardinality). Rare values will be grouped to limit dimensionality.")
        elif is_target and not is_numeric:
            remarks.append("Target column — encoding handled automatically in the modeling pipeline.")

        # --- Scaling ---
        if is_numeric and not is_target:
            t.scaling = "none"
            if numeric_summary:
                std_val = numeric_summary.get("std", 0)
                min_val = numeric_summary.get("min", 0)
                max_val = numeric_summary.get("max", 0)
                val_range = max_val - min_val
                if val_range > 1000 or std_val > 100:
                    remarks.append(f"Scaling: Consider StandardScaler — wide range [{min_val:.4g} to {max_val:.4g}], std={std_val:.4g}. Distance-based models (KNN, SVM) require scaling; tree models do not.")
                else:
                    remarks.append(f"Scaling: None needed — range [{min_val:.4g} to {max_val:.4g}] is manageable. Auto-applied for KNN/SVM in modeling.")
            else:
                remarks.append("Scaling: None by default. Auto-applied for distance-based models (KNN, SVM).")

        t.recommendation = " | ".join(remarks)
        treatments.append(t)

    return ETLPlan(
        drop_duplicates=True,
        treatments=treatments,
        target_column=suggested_target,
        dataset_type=detected_type,
    )


# ---------------------------------------------------------------------------
# Apply ETL plan
# ---------------------------------------------------------------------------

def apply_plan(content: bytes, filename: str, plan: ETLPlan) -> ETLApplyResponse:
    """Apply an ETL plan to raw file bytes. Return cleaned CSV + log."""
    df = _read_file(content, filename)
    rows_before = len(df)
    cols_before = len(df.columns)
    logs: list[TreatmentLog] = []

    # --- Drop duplicates ---
    if plan.drop_duplicates:
        n_before = len(df)
        df = df.drop_duplicates().reset_index(drop=True)
        n_removed = n_before - len(df)
        if n_removed > 0:
            logs.append(TreatmentLog(
                column="(all)",
                action="drop_duplicates",
                detail=f"Removed {n_removed} duplicate rows",
            ))

    # --- Per-column treatments ---
    for t in plan.treatments:
        if t.column not in df.columns:
            continue
        col = t.column

        # Drop column
        if t.drop:
            df = df.drop(columns=[col])
            logs.append(TreatmentLog(column=col, action="drop_column", detail="Dropped (too many nulls or user request)"))
            continue

        # Missing values
        if t.missing_strategy:
            n_nulls = int(df[col].isna().sum())
            if n_nulls > 0:
                if t.missing_strategy == "fill_median":
                    val = df[col].median()
                    df[col] = df[col].fillna(val)
                    logs.append(TreatmentLog(column=col, action="impute_median", detail=f"Filled {n_nulls} nulls with median ({val:.4g})"))
                elif t.missing_strategy == "fill_mean":
                    val = df[col].mean()
                    df[col] = df[col].fillna(val)
                    logs.append(TreatmentLog(column=col, action="impute_mean", detail=f"Filled {n_nulls} nulls with mean ({val:.4g})"))
                elif t.missing_strategy == "fill_mode":
                    val = df[col].mode().iloc[0] if not df[col].mode().empty else "Unknown"
                    df[col] = df[col].fillna(val)
                    logs.append(TreatmentLog(column=col, action="impute_mode", detail=f"Filled {n_nulls} nulls with mode ({val})"))
                elif t.missing_strategy == "fill_unknown":
                    df[col] = df[col].fillna("Unknown")
                    logs.append(TreatmentLog(column=col, action="impute_unknown", detail=f"Filled {n_nulls} nulls with 'Unknown'"))
                elif t.missing_strategy == "fill_ffill":
                    df[col] = df[col].ffill()
                    remaining = int(df[col].isna().sum())
                    if remaining > 0:
                        df[col] = df[col].bfill()
                    logs.append(TreatmentLog(column=col, action="impute_ffill", detail=f"Forward-filled {n_nulls} nulls"))
                elif t.missing_strategy == "fill_value":
                    fill_val = t.fill_value if t.fill_value is not None else "0"
                    df[col] = df[col].fillna(fill_val)
                    logs.append(TreatmentLog(column=col, action="impute_value", detail=f"Filled {n_nulls} nulls with '{fill_val}'"))
                elif t.missing_strategy == "drop_rows":
                    df = df.dropna(subset=[col]).reset_index(drop=True)
                    logs.append(TreatmentLog(column=col, action="drop_rows", detail=f"Dropped rows with nulls in {col} ({n_nulls} rows)"))

        # Outliers
        if t.outlier_strategy == "clip_iqr" and pd.api.types.is_numeric_dtype(df[col]):
            clean = df[col].dropna()
            if len(clean) >= 4:
                q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
                iqr = q3 - q1
                if iqr > 0:
                    lower = q1 - 1.5 * iqr
                    upper = q3 + 1.5 * iqr
                    n_clipped = int(((df[col] < lower) | (df[col] > upper)).sum())
                    if n_clipped > 0:
                        df[col] = df[col].clip(lower=lower, upper=upper)
                        logs.append(TreatmentLog(column=col, action="clip_iqr", detail=f"Clipped {n_clipped} outliers to [{lower:.4g}, {upper:.4g}]"))
        elif t.outlier_strategy == "remove" and pd.api.types.is_numeric_dtype(df[col]):
            clean = df[col].dropna()
            if len(clean) >= 4:
                q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
                iqr = q3 - q1
                if iqr > 0:
                    lower = q1 - 1.5 * iqr
                    upper = q3 + 1.5 * iqr
                    mask = (df[col] >= lower) & (df[col] <= upper) | df[col].isna()
                    n_removed = int((~mask).sum())
                    if n_removed > 0:
                        df = df[mask].reset_index(drop=True)
                        logs.append(TreatmentLog(column=col, action="remove_outliers", detail=f"Removed {n_removed} outlier rows"))

        # Encoding — we do NOT apply encoding here (it's done in the modeling pipeline)
        # We only log what will happen
        if t.encoding and t.encoding != "none":
            logs.append(TreatmentLog(column=col, action=f"encoding_{t.encoding}", detail=f"Will apply {t.encoding} encoding in modeling pipeline"))

        # Scaling — same: deferred to modeling pipeline
        if t.scaling and t.scaling not in ("none", None):
            logs.append(TreatmentLog(column=col, action=f"scaling_{t.scaling}", detail=f"Will apply {t.scaling} scaling in modeling pipeline"))

    # --- Encode cleaned CSV as base64 ---
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    csv_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    # Preview rows
    preview = df.head(50).replace({np.nan: None}).to_dict(orient="records")

    return ETLApplyResponse(
        rows_before=rows_before,
        rows_after=len(df),
        cols_before=cols_before,
        cols_after=len(df.columns),
        treatments_applied=logs,
        cleaned_csv_base64=csv_b64,
        preview_rows=preview,
        column_names=[str(c) for c in df.columns],
    )
