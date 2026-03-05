import api from "./client";
import type { ETLPlanData, ETLApplyResult, ProfileResponse } from "../types";

export async function fetchETLPlan(
  profile: ProfileResponse,
  datasetType?: string | null,
  targetColumn?: string | null
): Promise<ETLPlanData> {
  const response = await api.post<ETLPlanData>("/etl/plan", {
    profile,
    dataset_type: datasetType ?? undefined,
    target_column: targetColumn ?? undefined,
  });
  return response.data;
}

export async function applyETLPlan(
  file: Blob,
  filename: string,
  plan: ETLPlanData
): Promise<ETLApplyResult> {
  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("plan_json", JSON.stringify(plan));

  const response = await api.post<ETLApplyResult>("/etl/apply", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}
