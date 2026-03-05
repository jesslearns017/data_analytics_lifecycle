import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileSpreadsheet, AlertCircle, ArrowRight, Lightbulb } from "lucide-react";
import { profileFile } from "../api/profiling";
import type { ProfileResponse } from "../types";
import { saveRun, updateRun } from "../storage/db";
import DatasetPreviewTable from "../components/DatasetPreviewTable";
import LifecycleStepper from "../components/LifecycleStepper";
import LearnBanner from "../components/LearnBanner";

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [businessProblem, setBusinessProblem] = useState("");
  const [analyticsProblem, setAnalyticsProblem] = useState("");
  const [problemSaved, setProblemSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setProfile(null);
    setRunId(null);
    setLoading(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const result = await profileFile(f);
      setProfile(result);
      const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await saveRun({
        id,
        filename: f.name,
        uploadedAt: new Date().toISOString(),
        fileBlob: f,
        profile: result,
      });
      setRunId(id);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to process file.";
      setError(msg);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <LifecycleStepper currentStep={1} />

      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
        <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
        <p className="text-xs text-amber-800">
          <strong>Ephemeral app:</strong> All data is stored in your browser's local storage (IndexedDB). Clearing your browser data, using incognito mode, or switching browsers will erase your work. No data is saved on any server.
        </p>
      </div>

      <h1 className="text-2xl font-bold mb-1">Upload a dataset</h1>
      <p className="text-sm text-gray-500 mb-4">
        CSV or Excel. No code needed — we'll generate a profile and recommend
        cleaning steps automatically.
      </p>

      <LearnBanner stepNumber={1} title="Identify the Business Problem (Define the Goal)">
        <p>
          Every data analytics project starts with a <strong>question</strong>. Before looking at any data, you need to clearly define:
        </p>
        <p>
          • <strong>Business Objectives</strong> — What real-world issue are you trying to solve? (e.g., "Customer churn is costing us revenue.")<br />
          • <strong>Scope</strong> — What is the overall scope of the work? What information are stakeholders seeking?<br />
          • <strong>Analytics Problem</strong> — How can data help? What type of analysis should you use?<br />
          • <strong>Deliverables</strong> — What outputs does the project need to produce?
        </p>
        <p>
          Have these elements clearly defined <strong>before</strong> beginning your analysis. Ask as many questions as you can at the outset — often, you may not have another chance before project completion.
        </p>
        <p>
          Then <strong>collect the data</strong> (Step 2) — upload a CSV or Excel file that contains information relevant to your question. The system will automatically analyze its structure and suggest what type of analysis is appropriate.
        </p>
      </LearnBanner>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <Upload className="mx-auto mb-3 text-gray-400" size={40} />
        <p className="text-gray-600 mb-3">
          Drag &amp; drop your file here, or
        </p>
        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors text-sm font-medium">
          <FileSpreadsheet size={16} />
          Choose file
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFileInput}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-400 mt-3">
          Supported: CSV, Excel (.xlsx) — up to 200 MB
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-8 p-6 glass-card rounded-xl text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-700 mt-3">
            Processing {file?.name}...
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Elapsed: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} — this may take up to 2 minutes for large datasets
          </p>
          <div className="mt-3 w-48 mx-auto bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      )}

      {/* Results: split view */}
      {profile && !loading && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Preview table */}
          <div className="lg:col-span-2 glass-card rounded-xl p-4 overflow-auto">
            <h2 className="text-lg font-semibold mb-3">
              Preview (first {profile.preview_rows?.length ?? 0} rows)
            </h2>
            {profile.preview_rows && profile.column_names && (
              <DatasetPreviewTable
                columns={profile.column_names}
                rows={profile.preview_rows}
              />
            )}
          </div>

          {/* Snapshot card */}
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">Dataset Snapshot</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {profile.rows.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">Rows</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {profile.cols}
                </p>
                <p className="text-xs text-gray-500">Columns</p>
              </div>
            </div>

            {/* Type counts */}
            {profile.schema_inferred && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Column types
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    Object.values(profile.schema_inferred).reduce<
                      Record<string, number>
                    >((acc, dtype) => {
                      const key = dtype.startsWith("int") || dtype.startsWith("float")
                        ? "numeric"
                        : dtype === "object"
                        ? "text/categorical"
                        : dtype.includes("datetime")
                        ? "datetime"
                        : dtype;
                      acc[key] = (acc[key] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([type, count]) => (
                    <span
                      key={type}
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded"
                    >
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dataset type detection */}
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-600 mb-0.5">
                Detected type
              </p>
              <p className="text-sm font-semibold capitalize">
                {profile.dataset_type.detected_type.replace("_", " ")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">Target:</span>
                <select
                  value={profile.dataset_type.suggested_target || ""}
                  onChange={async (e) => {
                    const newTarget = e.target.value || null;
                    const updated = {
                      ...profile,
                      dataset_type: { ...profile.dataset_type, suggested_target: newTarget },
                    };
                    setProfile(updated);
                    if (runId) {
                      await updateRun(runId, { profile: updated, etlPlan: undefined, report: undefined, modelRuns: undefined });
                    }
                  }}
                  className="border rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">— none —</option>
                  {profile.columns.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              {profile.dataset_type.suggested_time_col && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Time column:{" "}
                  <span className="font-medium">
                    {profile.dataset_type.suggested_time_col}
                  </span>
                </p>
              )}
            </div>

            {/* Duplicates & missing summary */}
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-gray-500">Duplicate rows:</span>{" "}
                <span className="font-medium">{profile.duplicates_count}</span>
              </p>
              <p>
                <span className="text-gray-500">Missing cells:</span>{" "}
                <span className="font-medium">
                  {profile.columns
                    .reduce((s, c) => s + c.nulls_count, 0)
                    .toLocaleString()}
                </span>
              </p>
            </div>

            {profile.rows > 200_000 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                Large dataset — profiling may take longer.
              </p>
            )}

            {runId && (
              <button
                onClick={() => navigate(`/profile/${runId}`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Continue to Profile
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Problem Definition panel */}
      {profile && !loading && runId && (
        <div className="mt-8 glass-card rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <Lightbulb className="text-amber-500 shrink-0 mt-0.5" size={20} />
            <div>
              <h2 className="text-lg font-semibold">Problem Definition</h2>
              <p className="text-sm text-gray-500">
                Describe the business context and analytics objective for this dataset.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Problem
              </label>
              <textarea
                value={businessProblem}
                onChange={(e) => { setBusinessProblem(e.target.value); setProblemSaved(false); }}
                rows={3}
                placeholder="e.g. Customer churn is increasing, costing the company revenue. We need to identify at-risk customers to target retention efforts."
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Analytics Problem
              </label>
              <textarea
                value={analyticsProblem}
                onChange={(e) => { setAnalyticsProblem(e.target.value); setProblemSaved(false); }}
                rows={3}
                placeholder="e.g. Predict Y (Churn) based on features such as Age, Income, and Usage_Months using classification models."
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={async () => {
                if (runId) {
                  await updateRun(runId, {
                    problemDefinition: { businessProblem, analyticsProblem },
                  });
                  setProblemSaved(true);
                }
              }}
              disabled={!businessProblem.trim() && !analyticsProblem.trim()}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Problem Definition
            </button>
            {problemSaved && (
              <span className="text-sm text-green-600 font-medium">Saved!</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
