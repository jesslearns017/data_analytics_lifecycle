import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

export default api;

/**
 * Poll a background task until it completes or fails.
 * Returns the task result on success, throws on failure.
 */
export async function pollTask<T = any>(taskId: string, intervalMs = 2000): Promise<T> {
  while (true) {
    const { data } = await api.get(`/tasks/${taskId}`);
    if (data.status === "completed") {
      return data.result as T;
    }
    if (data.status === "failed") {
      throw new Error(data.error || "Task failed");
    }
    // Still running — wait and poll again
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
