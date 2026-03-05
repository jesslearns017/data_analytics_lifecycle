import api from "./client";
import type { ProfileResponse } from "../types";

export async function profileFile(file: File): Promise<ProfileResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<ProfileResponse>("/profile", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}
