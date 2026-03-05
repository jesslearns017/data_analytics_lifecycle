import api from "./client";

export interface ModelTrainConfig {
  target: string;
  problem_type: string;
  model_name: string;
  config: {
    test_size: number;
    random_seed: number;
    class_weight?: string | null;
    cv_folds?: number;
    use_smote?: boolean;
    n_estimators?: number | null;
    max_depth?: number | null;
    learning_rate?: number | null;
    degree?: number | null;
    k?: number | null;
    kernel?: string | null;
    C?: number | null;
    apply_scaling?: boolean;
  };
  feature_selection: {
    method: string;
    selected_features?: string[] | null;
    max_features?: number | null;
  };
  feature_engineering?: {
    enabled: boolean;
    log_transform?: string[] | null;
    bin_columns?: string[] | null;
    interaction_pairs?: string[][] | null;
  };
}

export async function trainModel(
  file: Blob,
  filename: string,
  config: ModelTrainConfig
): Promise<any> {
  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("config_json", JSON.stringify(config));

  try {
    const response = await api.post("/models/train", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (err: any) {
    // Extract backend error detail from 400/422 responses
    const detail = err?.response?.data?.detail;
    if (detail) {
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    throw err;
  }
}
