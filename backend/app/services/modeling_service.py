from __future__ import annotations

import io
import base64
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold, KFold
from sklearn.preprocessing import StandardScaler, OneHotEncoder, PolynomialFeatures
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    roc_curve,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    make_scorer,
)
from sklearn.linear_model import LinearRegression, LogisticRegression, Lasso
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
)
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.feature_selection import SequentialFeatureSelector

from app.schemas.modeling import (
    ClassificationMetrics,
    CVMetrics,
    FeatureImportance,
    ModelConfig,
    ModelTrainRequest,
    ModelTrainResponse,
    RegressionMetrics,
    FeatureSelectionConfig,
    FeatureEngineeringConfig,
)
from app.services.profiling_service import _read_file


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_preprocessor(
    numeric_features: list[str],
    categorical_features: list[str],
    apply_scaling: bool,
) -> ColumnTransformer:
    """Build the One Pipeline: numeric (impute median + optional scale) + categorical (impute Unknown + OHE)."""
    numeric_steps: list[tuple] = [("imputer", SimpleImputer(strategy="median"))]
    if apply_scaling:
        numeric_steps.append(("scaler", StandardScaler()))

    cat_steps: list[tuple] = [
        ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False, max_categories=50)),
    ]

    transformers = []
    if numeric_features:
        transformers.append(("num", Pipeline(numeric_steps), numeric_features))
    if categorical_features:
        transformers.append(("cat", Pipeline(cat_steps), categorical_features))

    return ColumnTransformer(transformers=transformers, remainder="drop")


def _get_model(model_name: str, config: ModelConfig, problem_type: str):
    """Instantiate a sklearn model from name + config."""
    rng = config.random_seed

    # --- Regression ---
    if model_name == "linear_regression":
        return LinearRegression()
    if model_name == "polynomial_regression":
        # Polynomial is handled separately (PolynomialFeatures + LinearRegression)
        return LinearRegression()
    if model_name == "decision_tree_regressor":
        return DecisionTreeRegressor(
            max_depth=config.max_depth or 5,
            random_state=rng,
        )
    if model_name == "random_forest_regressor":
        return RandomForestRegressor(
            n_estimators=config.n_estimators or 100,
            max_depth=config.max_depth,
            random_state=rng,
        )
    if model_name == "gradient_boosting_regressor":
        return GradientBoostingRegressor(
            n_estimators=config.n_estimators or 100,
            learning_rate=config.learning_rate or 0.1,
            random_state=rng,
        )

    # --- Classification ---
    cw = "balanced" if config.class_weight == "balanced" else None
    if model_name == "logistic_regression":
        return LogisticRegression(
            max_iter=1000,
            class_weight=cw,
            random_state=rng,
        )
    if model_name == "naive_bayes":
        return GaussianNB()
    if model_name == "decision_tree_classifier":
        return DecisionTreeClassifier(
            max_depth=config.max_depth or 5,
            class_weight=cw,
            random_state=rng,
        )
    if model_name == "random_forest_classifier":
        return RandomForestClassifier(
            n_estimators=config.n_estimators or 100,
            max_depth=config.max_depth,
            class_weight=cw,
            random_state=rng,
        )
    if model_name == "gradient_boosting_classifier":
        return GradientBoostingClassifier(
            n_estimators=config.n_estimators or 100,
            learning_rate=config.learning_rate or 0.1,
            random_state=rng,
        )
    if model_name == "knn_classifier":
        return KNeighborsClassifier(
            n_neighbors=config.k or 5,
        )
    if model_name == "svm_classifier":
        return SVC(
            kernel=config.kernel or "rbf",
            C=config.C or 1.0,
            probability=True,
            class_weight=cw,
            random_state=rng,
        )

    raise ValueError(f"Unknown model: {model_name}")


REGRESSION_MODELS = {
    "linear_regression",
    "polynomial_regression",
    "decision_tree_regressor",
    "random_forest_regressor",
    "gradient_boosting_regressor",
}

CLASSIFICATION_MODELS = {
    "logistic_regression",
    "naive_bayes",
    "decision_tree_classifier",
    "random_forest_classifier",
    "gradient_boosting_classifier",
    "knn_classifier",
    "svm_classifier",
}


def _infer_problem_type(model_name: str, y: pd.Series, requested: str) -> str:
    """Resolve problem type from request + model name + target data."""
    if requested in ("classification", "regression"):
        return requested
    if model_name in REGRESSION_MODELS:
        return "regression"
    if model_name in CLASSIFICATION_MODELS:
        return "classification"
    # Auto-detect
    if y.nunique() <= 10 or y.dtype == object:
        return "classification"
    return "regression"


# ---------------------------------------------------------------------------
# Feature selection
# ---------------------------------------------------------------------------

def _select_features(
    X_train: np.ndarray,
    y_train: np.ndarray,
    feature_names: list[str],
    fs_config: FeatureSelectionConfig,
    model,
    problem_type: str,
) -> list[int]:
    """Return indices of selected features."""
    if fs_config.method == "none" or fs_config.method == "manual":
        return list(range(X_train.shape[1]))

    max_feats = fs_config.max_features or min(10, X_train.shape[1])
    max_feats = min(max_feats, X_train.shape[1])

    if fs_config.method == "lasso":
        scoring = "r2" if problem_type == "regression" else "accuracy"
        alpha = 0.01 if problem_type == "regression" else 1.0
        lasso = Lasso(alpha=alpha, max_iter=2000)
        try:
            lasso.fit(X_train, y_train)
            importances = np.abs(lasso.coef_) if lasso.coef_.ndim == 1 else np.abs(lasso.coef_).mean(axis=0)
            top_idx = np.argsort(importances)[::-1][:max_feats]
            if len(top_idx) == 0:
                return list(range(X_train.shape[1]))
            return sorted(top_idx.tolist())
        except Exception:
            return list(range(X_train.shape[1]))

    if fs_config.method in ("forward", "backward"):
        direction = "forward" if fs_config.method == "forward" else "backward"
        scoring = "r2" if problem_type == "regression" else "accuracy"
        try:
            sfs = SequentialFeatureSelector(
                model,
                n_features_to_select=max_feats,
                direction=direction,
                scoring=scoring,
                n_jobs=-1,
                cv=3,
            )
            sfs.fit(X_train, y_train)
            return sorted(np.where(sfs.get_support())[0].tolist())
        except Exception:
            return list(range(X_train.shape[1]))

    return list(range(X_train.shape[1]))


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def _apply_feature_engineering(df: pd.DataFrame, target: str, fe: FeatureEngineeringConfig) -> tuple[pd.DataFrame, list[str]]:
    """Apply feature engineering transforms to the dataframe. Returns (df, list of descriptions)."""
    descriptions: list[str] = []
    X_cols = [c for c in df.columns if c != target]
    numeric_cols = df[X_cols].select_dtypes(include="number").columns.tolist()

    # Auto-detect skewed columns for log transform
    if fe.enabled and not fe.log_transform:
        skewed = []
        for col in numeric_cols:
            vals = df[col].dropna()
            if len(vals) > 10 and vals.min() >= 0:
                skewness = vals.skew()
                if abs(skewness) > 1.0:
                    skewed.append(col)
        if skewed:
            fe.log_transform = skewed[:5]  # limit to top 5

    # Log transform
    if fe.log_transform:
        for col in fe.log_transform:
            if col in df.columns and col != target:
                vals = df[col]
                if pd.api.types.is_numeric_dtype(vals) and vals.min() >= 0:
                    df[f"{col}_log"] = np.log1p(vals)
                    descriptions.append(f"log1p({col})")

    # Binning
    if fe.bin_columns:
        for col in fe.bin_columns:
            if col in df.columns and col != target and pd.api.types.is_numeric_dtype(df[col]):
                try:
                    df[f"{col}_binned"] = pd.qcut(df[col], q=4, labels=False, duplicates="drop")
                    descriptions.append(f"binned({col}, 4 quantiles)")
                except Exception:
                    pass

    # Auto-detect bin candidates if enabled but none specified
    if fe.enabled and not fe.bin_columns:
        for col in numeric_cols[:3]:
            if col != target and df[col].nunique() > 20:
                try:
                    df[f"{col}_binned"] = pd.qcut(df[col], q=4, labels=False, duplicates="drop")
                    descriptions.append(f"binned({col}, 4 quantiles)")
                except Exception:
                    pass

    # Interaction pairs
    if fe.interaction_pairs:
        for pair in fe.interaction_pairs:
            if len(pair) == 2 and pair[0] in df.columns and pair[1] in df.columns:
                c1, c2 = pair
                if pd.api.types.is_numeric_dtype(df[c1]) and pd.api.types.is_numeric_dtype(df[c2]):
                    df[f"{c1}_x_{c2}"] = df[c1] * df[c2]
                    descriptions.append(f"interaction({c1} × {c2})")

    # Auto-detect interaction pairs from top correlated features
    if fe.enabled and not fe.interaction_pairs and len(numeric_cols) >= 2:
        if target in df.columns and pd.api.types.is_numeric_dtype(df[target]):
            corrs = df[numeric_cols].corrwith(df[target]).abs().sort_values(ascending=False)
            top = corrs.head(3).index.tolist()
            if len(top) >= 2:
                c1, c2 = top[0], top[1]
                df[f"{c1}_x_{c2}"] = df[c1] * df[c2]
                descriptions.append(f"interaction({c1} × {c2})")

    return df, descriptions


# ---------------------------------------------------------------------------
# Cross-validation
# ---------------------------------------------------------------------------

def _run_cross_validation(
    model, X: np.ndarray, y: np.ndarray, problem_type: str, cv_folds: int, random_seed: int,
) -> list[CVMetrics]:
    """Run k-fold cross-validation and return metrics per fold."""
    results: list[CVMetrics] = []

    if cv_folds < 2:
        return results

    try:
        if problem_type == "classification":
            cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=random_seed)
            for metric_name, scoring in [("accuracy", "accuracy"), ("f1", "f1_weighted")]:
                scores = cross_val_score(model, X, y, cv=cv, scoring=scoring, error_score="raise")
                results.append(CVMetrics(
                    metric_name=metric_name,
                    mean=round(float(scores.mean()), 4),
                    std=round(float(scores.std()), 4),
                    folds=[round(float(s), 4) for s in scores],
                ))
        else:
            cv = KFold(n_splits=cv_folds, shuffle=True, random_state=random_seed)
            for metric_name, scoring in [("r2", "r2"), ("neg_mae", "neg_mean_absolute_error")]:
                scores = cross_val_score(model, X, y, cv=cv, scoring=scoring, error_score="raise")
                display_scores = scores if metric_name == "r2" else -scores
                results.append(CVMetrics(
                    metric_name="mae" if metric_name == "neg_mae" else metric_name,
                    mean=round(float(display_scores.mean()), 4),
                    std=round(float(display_scores.std()), 4),
                    folds=[round(float(s), 4) for s in display_scores],
                ))
    except Exception:
        pass  # CV can fail on small datasets; fall back to no CV

    return results


# ---------------------------------------------------------------------------
# Main training function
# ---------------------------------------------------------------------------

def train_model(content: bytes, filename: str, req: ModelTrainRequest) -> ModelTrainResponse:
    """Full training pipeline: preprocess → feature select → train → evaluate → return metrics + charts."""
    df = _read_file(content, filename)

    if req.target not in df.columns:
        raise ValueError(f"Target column '{req.target}' not found in dataset.")

    # --- Row sampling (reduce dataset size to prevent memory issues) ---
    if req.config.sample_size and req.config.sample_size < len(df):
        df = df.sample(n=req.config.sample_size, random_state=req.config.random_seed).reset_index(drop=True)

    # --- Feature engineering (before splitting) ---
    fe_descriptions: list[str] = []
    if req.feature_engineering.enabled or req.feature_engineering.log_transform or req.feature_engineering.bin_columns or req.feature_engineering.interaction_pairs:
        df, fe_descriptions = _apply_feature_engineering(df, req.target, req.feature_engineering)

    y = df[req.target]
    X = df.drop(columns=[req.target])

    problem_type = _infer_problem_type(req.model_name, y, req.problem_type)

    # --- Validate model vs data compatibility ---
    is_target_categorical = y.dtype == object or y.nunique() <= 10
    model_is_regression = req.model_name in REGRESSION_MODELS
    model_is_classification = req.model_name in CLASSIFICATION_MODELS

    if model_is_regression and is_target_categorical:
        unique_vals = ", ".join([str(v) for v in y.dropna().unique()[:6]])
        raise ValueError(
            f"Model mismatch: You selected a regression model ('{req.model_name.replace('_', ' ')}'), "
            f"but the target column '{req.target}' is categorical with {y.nunique()} unique values [{unique_vals}]. "
            f"Please select a classification model instead (e.g., Logistic Regression, Random Forest Classifier, "
            f"Gradient Boosting Classifier)."
        )

    if model_is_classification and not is_target_categorical and y.nunique() > 20:
        raise ValueError(
            f"Model mismatch: You selected a classification model ('{req.model_name.replace('_', ' ')}'), "
            f"but the target column '{req.target}' has {y.nunique()} unique numeric values, "
            f"which looks like a continuous variable. "
            f"Please select a regression model instead (e.g., Linear Regression, Random Forest Regressor, "
            f"Gradient Boosting Regressor)."
        )

    # Encode target for classification if it's string
    label_map: dict[int, str] | None = None
    if problem_type == "classification" and y.dtype == object:
        labels_sorted = sorted(y.dropna().unique().tolist())
        label_map = {i: str(v) for i, v in enumerate(labels_sorted)}
        reverse_map = {str(v): i for i, v in enumerate(labels_sorted)}
        y = y.map(reverse_map)

    # Drop rows where target is null
    mask = y.notna()
    X = X[mask].reset_index(drop=True)
    y = y[mask].reset_index(drop=True)

    # Identify feature types
    numeric_features = X.select_dtypes(include="number").columns.tolist()
    categorical_features = X.select_dtypes(include=["object", "category"]).columns.tolist()

    # Manual feature selection — filter columns
    if req.feature_selection.method == "manual" and req.feature_selection.selected_features:
        selected = req.feature_selection.selected_features
        numeric_features = [f for f in numeric_features if f in selected]
        categorical_features = [f for f in categorical_features if f in selected]
        X = X[numeric_features + categorical_features]

    all_feature_names = numeric_features + categorical_features
    if len(all_feature_names) == 0:
        raise ValueError("No features available for training.")

    # --- Memory guard: estimate post-encoding column count ---
    estimated_cols = len(numeric_features)
    for col in categorical_features:
        n_cat = min(X[col].nunique(), 50)  # capped at 50 by OneHotEncoder
        estimated_cols += n_cat
    estimated_cells = estimated_cols * len(X) * 8  # float64 = 8 bytes
    max_mem_bytes = 4 * 1024 ** 3  # 4 GB limit
    if estimated_cells > max_mem_bytes:
        est_gb = estimated_cells / (1024 ** 3)
        raise ValueError(
            f"Dataset too large for training: ~{est_gb:.1f} GB estimated after encoding "
            f"({len(X):,} rows × {estimated_cols:,} features). "
            f"Try one or more of: (1) Enable 'Sample rows' to reduce the dataset size, "
            f"(2) Use manual feature selection to drop high-cardinality columns, "
            f"(3) Switch categorical columns with many unique values to Label encoding in the ETL step."
        )

    # Auto-scaling for KNN/SVM
    apply_scaling = req.config.apply_scaling
    if req.model_name in ("knn_classifier", "svm_classifier"):
        apply_scaling = True

    # Build preprocessor
    preprocessor = _build_preprocessor(numeric_features, categorical_features, apply_scaling)

    # Train/test split
    stratify = y if problem_type == "classification" else None
    test_size = req.config.test_size
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=req.config.random_seed, stratify=stratify,
    )

    # Preprocess
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)

    # Get transformed feature names
    try:
        transformed_names = preprocessor.get_feature_names_out().tolist()
    except Exception:
        transformed_names = [f"f{i}" for i in range(X_train_proc.shape[1])]

    # Polynomial features (special case)
    poly = None
    if req.model_name == "polynomial_regression":
        degree = req.config.degree or 2
        poly = PolynomialFeatures(degree=degree, include_bias=False)
        X_train_proc = poly.fit_transform(X_train_proc)
        X_test_proc = poly.transform(X_test_proc)
        try:
            transformed_names = poly.get_feature_names_out(transformed_names).tolist()
        except Exception:
            transformed_names = [f"poly_f{i}" for i in range(X_train_proc.shape[1])]

    # Build model
    model = _get_model(req.model_name, req.config, problem_type)

    # Feature selection (forward/backward/lasso)
    selected_indices = _select_features(
        X_train_proc, y_train.values, transformed_names, req.feature_selection, model, problem_type,
    )
    X_train_sel = X_train_proc[:, selected_indices]
    X_test_sel = X_test_proc[:, selected_indices]
    selected_feature_names = [transformed_names[i] for i in selected_indices]

    # --- SMOTE for class imbalance ---
    smote_applied = False
    if req.config.use_smote and problem_type == "classification":
        try:
            from imblearn.over_sampling import SMOTE
            sm = SMOTE(random_state=req.config.random_seed)
            X_train_sel, y_train = sm.fit_resample(X_train_sel, y_train)
            smote_applied = True
        except ImportError:
            pass  # imblearn not installed — skip silently
        except Exception:
            pass  # SMOTE can fail on very small datasets

    # --- Cross-validation (on training data, before final fit) ---
    cv_results = _run_cross_validation(
        _get_model(req.model_name, req.config, problem_type),  # fresh model for CV
        X_train_sel, y_train.values if hasattr(y_train, 'values') else y_train,
        problem_type, req.config.cv_folds, req.config.random_seed,
    )

    # Train final model
    model.fit(X_train_sel, y_train)

    # Predict
    y_pred = model.predict(X_test_sel)

    # --- Build response ---
    response = ModelTrainResponse(
        model_name=req.model_name,
        problem_type=problem_type,
        target=req.target,
        features_used=selected_feature_names,
        feature_engineering_applied=fe_descriptions if fe_descriptions else None,
        smote_applied=smote_applied,
    )

    # Feature importances
    importances = _extract_importances(model, selected_feature_names)
    if importances:
        response.feature_importances = importances

    if problem_type == "classification":
        labels = label_map if label_map else {i: str(i) for i in sorted(y.unique().tolist())}
        label_list = [labels[k] for k in sorted(labels.keys())]

        acc = float(accuracy_score(y_test, y_pred))
        prec = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
        rec = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
        f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))

        cm = confusion_matrix(y_test, y_pred).tolist()

        # ROC (binary only)
        roc_auc_val = None
        roc_data = None
        if len(label_list) == 2:
            try:
                y_proba = model.predict_proba(X_test_sel)[:, 1]
                roc_auc_val = float(roc_auc_score(y_test, y_proba))
                fpr, tpr, _ = roc_curve(y_test, y_proba)
                roc_data = {
                    "fpr": [round(float(v), 4) for v in fpr],
                    "tpr": [round(float(v), 4) for v in tpr],
                    "auc": round(roc_auc_val, 4),
                }
            except Exception:
                pass

        response.classification_metrics = ClassificationMetrics(
            accuracy=round(acc, 4),
            precision=round(prec, 4),
            recall=round(rec, 4),
            f1=round(f1, 4),
            roc_auc=round(roc_auc_val, 4) if roc_auc_val is not None else None,
            confusion_matrix=cm,
            labels=label_list,
            cv=cv_results if cv_results else None,
        )
        response.confusion_matrix_data = {
            "z": cm,
            "x": label_list,
            "y": label_list,
        }
        response.roc_curve_data = roc_data

    else:
        # Regression
        mae = float(mean_absolute_error(y_test, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        r2 = float(r2_score(y_test, y_pred))

        response.regression_metrics = RegressionMetrics(
            mae=round(mae, 4),
            rmse=round(rmse, 4),
            r2=round(r2, 4),
            cv=cv_results if cv_results else None,
        )
        response.predicted_vs_actual = {
            "y_true": [round(float(v), 4) for v in y_test.values],
            "y_pred": [round(float(v), 4) for v in y_pred],
        }
        residuals = y_test.values - y_pred
        response.residuals_data = {
            "y_pred": [round(float(v), 4) for v in y_pred],
            "residuals": [round(float(v), 4) for v in residuals],
        }

        # Coefficients for linear/polynomial
        if hasattr(model, "coef_"):
            coefs = model.coef_.flatten() if model.coef_.ndim > 1 else model.coef_
            if len(coefs) == len(selected_feature_names):
                response.coefficients = [
                    {"feature": name, "coef": round(float(c), 6)}
                    for name, c in zip(selected_feature_names, coefs)
                ]

    return response


def _extract_importances(model, feature_names: list[str]) -> list[FeatureImportance] | None:
    """Extract feature importances from model if available."""
    importances = None
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        coefs = model.coef_.flatten() if model.coef_.ndim > 1 else model.coef_
        if hasattr(model.coef_, "ndim") and model.coef_.ndim > 1:
            importances = np.abs(model.coef_).mean(axis=0)
        else:
            importances = np.abs(coefs)

    if importances is not None and len(importances) == len(feature_names):
        pairs = sorted(
            zip(feature_names, importances),
            key=lambda x: abs(x[1]),
            reverse=True,
        )
        return [
            FeatureImportance(feature=name, importance=round(float(imp), 6))
            for name, imp in pairs[:20]  # Top 20
        ]
    return None
