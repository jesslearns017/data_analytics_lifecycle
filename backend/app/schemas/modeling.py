from __future__ import annotations

from pydantic import BaseModel


class FeatureEngineeringConfig(BaseModel):
    log_transform: list[str] | None = None        # columns to log-transform
    bin_columns: list[str] | None = None           # columns to bin into quantiles
    interaction_pairs: list[list[str]] | None = None  # pairs of columns to multiply
    enabled: bool = False


class ModelConfig(BaseModel):
    test_size: float = 0.2
    random_seed: int = 42
    sample_size: int | None = None               # Max rows to use (None = all)
    class_weight: str | None = None  # "none" | "balanced"
    cv_folds: int = 5                             # k-fold cross-validation
    use_smote: bool = False                       # SMOTE for class imbalance
    # Model-specific hyperparams
    n_estimators: int | None = None       # RF, GB
    max_depth: int | None = None          # DT, RF
    learning_rate: float | None = None    # GB
    degree: int | None = None             # Polynomial
    k: int | None = None                  # KNN
    kernel: str | None = None             # SVM: "linear" | "rbf"
    C: float | None = None               # SVM
    apply_scaling: bool = False           # Auto-scale for KNN/SVM


class FeatureSelectionConfig(BaseModel):
    method: str = "none"  # "none" | "manual" | "forward" | "backward" | "lasso"
    selected_features: list[str] | None = None  # For manual selection
    max_features: int | None = None  # For forward/backward


class ModelTrainRequest(BaseModel):
    target: str
    problem_type: str  # "auto" | "classification" | "regression"
    model_name: str
    config: ModelConfig = ModelConfig()
    feature_selection: FeatureSelectionConfig = FeatureSelectionConfig()
    feature_engineering: FeatureEngineeringConfig = FeatureEngineeringConfig()


class CVMetrics(BaseModel):
    metric_name: str
    mean: float
    std: float
    folds: list[float]


class ClassificationMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1: float
    roc_auc: float | None = None
    confusion_matrix: list[list[int]]
    labels: list[str]
    cv: list[CVMetrics] | None = None


class RegressionMetrics(BaseModel):
    mae: float
    rmse: float
    r2: float
    cv: list[CVMetrics] | None = None


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class ModelTrainResponse(BaseModel):
    model_name: str
    problem_type: str
    target: str
    features_used: list[str]
    classification_metrics: ClassificationMetrics | None = None
    regression_metrics: RegressionMetrics | None = None
    feature_importances: list[FeatureImportance] | None = None
    feature_engineering_applied: list[str] | None = None  # descriptions of FE steps
    smote_applied: bool = False
    # Chart data
    confusion_matrix_data: dict | None = None       # {z, x, y}
    roc_curve_data: dict | None = None              # {fpr, tpr, auc}
    predicted_vs_actual: dict | None = None         # {y_true, y_pred}
    residuals_data: dict | None = None              # {y_pred, residuals}
    coefficients: list[dict] | None = None          # [{feature, coef}]
