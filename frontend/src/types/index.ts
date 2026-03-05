export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobType = "PROFILE" | "ETL_APPLY" | "MODEL_TRAIN";

export type TopValue = { value: string; count: number };

export type NumericSummary = {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
};

export type OutlierEstimate = { count: number; pct: number };

export type ColumnProfile = {
  name: string;
  dtype: string;
  nulls_count: number;
  nulls_pct: number;
  n_unique: number;
  top_values?: TopValue[];
  numeric_summary?: NumericSummary;
  outlier_estimate?: OutlierEstimate;
  datetime_candidate?: boolean;
};

export type CorrelationMatrix = {
  columns: string[];
  matrix: number[][];
};

export type TimeSeries = {
  datetime_candidates: string[];
  selected_time_col?: string | null;
  inferred_frequency?: string | null;
};

export type DatasetTypeDetection = {
  detected_type: string;
  suggested_target?: string | null;
  suggested_time_col?: string | null;
  suggested_entity_col?: string | null;
  type_reason?: string | null;
  target_reason?: string | null;
};

export type ProfileResponse = {
  rows: number;
  cols: number;
  duplicates_count: number;
  columns: ColumnProfile[];
  correlation?: CorrelationMatrix | null;
  time_series: TimeSeries;
  dataset_type: DatasetTypeDetection;
  preview_rows?: Record<string, unknown>[];
  column_names?: string[];
  schema_inferred?: Record<string, string>;
};

export type ETLPlan = {
  missing: {
    strategy: "drop_rows" | "drop_cols" | "impute";
    threshold?: number;
    numeric_impute?: "mean" | "median" | "knn";
    categorical_impute?: "most_frequent" | "unknown";
    ts_impute?: "ffill" | "interpolate";
    time_col?: string | null;
  };
  duplicates: { remove: boolean };
  outliers: {
    strategy: "none" | "clip" | "remove";
    method: "iqr";
    iqr_factor: number;
  };
  encoding: {
    categorical: "none" | "onehot" | "ordinal";
    rare_to_other?: boolean;
    rare_threshold?: number;
  };
  scaling: { numeric: "none" | "standard" | "minmax" };
  split: { type: "random" | "time"; test_size: number; time_col?: string | null };
};

export type ReportResponse = {
  health_score: number;
  dataset_fingerprint: {
    rows_before: number;
    rows_after: number;
    cols_before: number;
    cols_after: number;
    missing_cells_before: number;
    missing_cells_after: number;
  };
  issues: {
    missingness_penalty: number;
    duplicates_penalty: number;
    outliers_penalty: number;
    high_cardinality_penalty: number;
    imbalance_penalty: number;
  };
  treatments: string[];
  charts: {
    missingness_bar: { x: string[]; y: number[] };
    correlation_heatmap?: { x: string[]; y: string[]; z: number[][] };
    distributions?: Array<{
      column: string;
      before: { bins: number[]; counts: number[] };
      after: { bins: number[]; counts: number[] };
    }>;
  };
};

export type ModelName =
  | "linear_regression"
  | "polynomial_regression"
  | "decision_tree_regressor"
  | "random_forest_regressor"
  | "gradient_boosting_regressor"
  | "logistic_regression"
  | "naive_bayes"
  | "decision_tree_classifier"
  | "random_forest_classifier"
  | "gradient_boosting_classifier"
  | "knn_classifier"
  | "svm_classifier";

export type ModelTrainRequest = {
  target: string;
  problem_type: "auto" | "classification" | "regression";
  model_name: ModelName;
  config: {
    test_size: number;
    random_seed: number;
    cv_folds?: number;
    class_weight?: "none" | "balanced";
  };
};

export type ClassificationMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc?: number | null;
  confusion_matrix: number[][];
  labels: string[];
};

export type RegressionMetrics = {
  mae: number;
  rmse: number;
  r2: number;
};

export type ModelRun = {
  id: string;
  run_id: string;
  target: string;
  problem_type: "classification" | "regression";
  model_name: ModelName;
  metrics: {
    classification?: ClassificationMetrics;
    regression?: RegressionMetrics;
  };
  created_at: string;
};

// --- ETL types ---

export type ColumnTreatment = {
  column: string;
  missing_strategy?: string | null;
  fill_value?: string | null;
  outlier_strategy?: string | null;
  encoding?: string | null;
  scaling?: string | null;
  drop?: boolean;
  recommendation?: string | null;
};

export type ETLPlanData = {
  drop_duplicates: boolean;
  treatments: ColumnTreatment[];
  target_column?: string | null;
  dataset_type?: string | null;
};

export type TreatmentLog = {
  column: string;
  action: string;
  detail: string;
};

export type HealthScore = {
  total: number | null;
  insufficient_data: boolean;
  completeness: number;
  consistency: number;
  statistical_integrity: number;
  feature_usefulness: number;
  modeling_readiness: number;
};

export type ETLApplyResult = {
  rows_before: number;
  rows_after: number;
  cols_before: number;
  cols_after: number;
  treatments_applied: TreatmentLog[];
  cleaned_csv_base64: string;
  preview_rows?: Record<string, unknown>[];
  column_names?: string[];
  health_before: HealthScore;
  health_after: HealthScore;
};
