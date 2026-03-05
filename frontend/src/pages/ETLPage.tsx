import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Wrench,
  Play,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import { getRun, updateRun, type RunRecord } from "../storage/db";
import type {
  ProfileResponse,
  ETLPlanData,
  ColumnTreatment,
  ETLApplyResult,
  HealthScore,
} from "../types";
import { fetchETLPlan, applyETLPlan } from "../api/etl";
import DatasetPreviewTable from "../components/DatasetPreviewTable";
import { HelpBanner } from "../components/HelpTip";
import LifecycleStepper from "../components/LifecycleStepper";
import LearnBanner from "../components/LearnBanner";

const MISSING_OPTIONS = [
  { value: "", label: "No action" },
  { value: "fill_median", label: "Fill median" },
  { value: "fill_mean", label: "Fill mean" },
  { value: "fill_mode", label: "Fill mode" },
  { value: "fill_unknown", label: "Fill 'Unknown'" },
  { value: "fill_ffill", label: "Forward fill" },
  { value: "fill_value", label: "Fill custom value" },
  { value: "drop_rows", label: "Drop rows" },
];

const OUTLIER_OPTIONS = [
  { value: "", label: "No action" },
  { value: "none", label: "None" },
  { value: "clip_iqr", label: "Clip (IQR)" },
  { value: "remove", label: "Remove rows" },
];

const ENCODING_OPTIONS = [
  { value: "", label: "No action" },
  { value: "none", label: "None" },
  { value: "onehot", label: "One-Hot" },
  { value: "label", label: "Label" },
];

const SCALING_OPTIONS = [
  { value: "", label: "No action" },
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "minmax", label: "MinMax" },
];

function scoreColor(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-blue-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function scoreLabel(score: number | null): string {
  if (score === null) return "N/A";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Significant issues";
  return "Poor";
}

function HealthScoreCard({
  title,
  score,
}: {
  title: string;
  score: HealthScore | null;
}) {
  if (!score || score.insufficient_data) {
    return (
      <div className="glass-card rounded-xl p-5">
        <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
        <p className="text-sm text-gray-400">Insufficient data</p>
      </div>
    );
  }

  const categories = [
    { label: "Completeness", value: score.completeness, max: 20 },
    { label: "Consistency", value: score.consistency, max: 20 },
    { label: "Statistical Integrity", value: score.statistical_integrity, max: 20 },
    { label: "Feature Usefulness", value: score.feature_usefulness, max: 20 },
    { label: "Modeling Readiness", value: score.modeling_readiness, max: 20 },
  ];

  return (
    <div className="glass-card rounded-xl p-5">
      <p className="text-xs font-medium text-gray-500 mb-2">{title}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-3xl font-bold ${scoreColor(score.total)}`}>
          {score.total}
        </span>
        <span className="text-sm text-gray-500">/ 100</span>
        <span className={`text-xs font-medium ${scoreColor(score.total)}`}>
          {scoreLabel(score.total)}
        </span>
      </div>
      <div className="space-y-1.5">
        {categories.map((cat) => (
          <div key={cat.label} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-36 shrink-0">
              {cat.label}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${(cat.value / cat.max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 w-10 text-right">
              {cat.value}/{cat.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ETLPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ETLPlanData | null>(null);
  const [result, setResult] = useState<ETLApplyResult | null>(null);
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());
  const [showAllTreatments, setShowAllTreatments] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Load run from IndexedDB
  useEffect(() => {
    if (!runId) return;
    getRun(runId).then((r) => {
      setRun(r ?? null);
      // If a plan was previously saved, restore it
      if (r?.etlPlan) {
        setPlan(r.etlPlan as ETLPlanData);
      }
      setLoading(false);
    });
  }, [runId]);

  // Auto-generate plan if none exists
  const generatePlan = useCallback(async () => {
    if (!run?.profile) return;
    setPlanLoading(true);
    setError(null);
    startTimer();
    try {
      const profile = run.profile as ProfileResponse;
      const newPlan = await fetchETLPlan(
        profile,
        profile.dataset_type.detected_type,
        profile.dataset_type.suggested_target
      );
      setPlan(newPlan);
      // Save plan to IndexedDB
      if (runId) {
        await updateRun(runId, { etlPlan: newPlan });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate plan.";
      setError(msg);
    } finally {
      stopTimer();
      setPlanLoading(false);
    }
  }, [run, runId]);

  useEffect(() => {
    if (run?.profile && !plan && !planLoading) {
      generatePlan();
    }
  }, [run, plan, planLoading, generatePlan]);

  // Apply the plan
  const handleApply = useCallback(async () => {
    if (!run || !plan) return;
    setApplyLoading(true);
    setError(null);
    startTimer();
    try {
      const res = await applyETLPlan(run.fileBlob, run.filename, plan);
      setResult(res);
      // Auto-scroll to results after a short delay for render
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      // Save cleaned data + plan + result to IndexedDB
      if (runId) {
        // Decode base64 CSV to blob
        const binaryStr = atob(res.cleaned_csv_base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const cleanedBlob = new Blob([bytes], { type: "text/csv" });
        await updateRun(runId, {
          etlPlan: plan,
          cleanedBlob,
          report: res,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ETL failed.";
      setError(msg);
    } finally {
      stopTimer();
      setApplyLoading(false);
    }
  }, [run, plan, runId]);

  // Update a single treatment
  const updateTreatment = (index: number, updates: Partial<ColumnTreatment>) => {
    if (!plan) return;
    const newTreatments = [...plan.treatments];
    newTreatments[index] = { ...newTreatments[index], ...updates };
    setPlan({ ...plan, treatments: newTreatments });
  };

  const toggleExpand = (col: string) => {
    setExpandedCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!run || !run.profile) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-gray-500">
          Run not found.{" "}
          <Link to="/upload" className="text-blue-600 underline">
            Upload a new dataset
          </Link>
        </p>
      </div>
    );
  }

  const profile = run.profile as ProfileResponse;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <LifecycleStepper currentStep={4} runId={runId} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench size={24} className="text-blue-600" />
            Data Cleaning (ETL)
          </h1>
          <p className="text-sm text-gray-500">
            {run.filename} — {profile.rows.toLocaleString()} rows,{" "}
            {profile.cols} cols
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to={`/profile/${runId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Profile
          </Link>
        </div>
      </div>

      <LearnBanner stepNumber={3} title="Clean the Data & Transform the Data (Enrich the Data)">
        <p>
          <strong>Step 3 — Prepare the Data (Clean):</strong> Once you've identified errors in your dataset, begin cleaning.
          Input missing variables, create broad categories for uncategorized data, and remove duplicates. Imputing average or median scores for missing values
          helps the data process more efficiently without skewing it. This is the "garbage in, garbage out" principle.
        </p>
        <p>
          <strong>Step 4 — Transform the Data (Enrich):</strong> After cleaning, prepare features for modeling: <strong>encode</strong> categorical text into numbers (One-Hot or Label),
          and <strong>scale</strong> numeric ranges so distance-based models (KNN, SVM) work correctly. Enriching the data makes it ready for exploratory analysis and modeling.
        </p>
        <p>
          • <strong>Review</strong> the recommended plan — expand any column to see what will happen and why<br />
          • <strong>Customize</strong> any action — change how missing values are handled, whether outliers are clipped, encoding, scaling, etc.<br />
          • <strong>Apply</strong> the plan — the system cleans and transforms your data, then shows a <strong>Health Score</strong> before vs. after
        </p>
        <p>
          The <strong>Health Score</strong> (0–100) measures data quality across 5 dimensions: completeness, consistency, statistical integrity, feature usefulness, and modeling readiness.
        </p>
      </LearnBanner>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Plan loading */}
      {planLoading && (
        <div className="mb-6 p-6 glass-card rounded-xl text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-700 mt-3">Generating recommended plan...</p>
          <p className="text-xs text-gray-400 mt-1">
            Elapsed: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} — this may take up to 2 minutes for large datasets
          </p>
          <div className="mt-3 w-48 mx-auto bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      )}

      {/* ETL Plan editor */}
      {plan && !planLoading && (
        <>
          {/* Help banner */}
          <div className="mb-6">
            <HelpBanner title="What is data cleaning and what do these options mean?">
              <p><strong>Data cleaning (ETL)</strong> prepares raw data for analysis by handling common issues. The system auto-recommends actions based on your data profile, but you can customize everything.</p>
              <p className="font-semibold mt-2">Missing Values strategies:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Fill median</strong> — Replaces nulls with the middle value. Best for numeric columns with outliers (median is robust to extremes).</li>
                <li><strong>Fill mean</strong> — Replaces nulls with the average. Use when data is roughly symmetric (no extreme outliers).</li>
                <li><strong>Fill mode</strong> — Replaces nulls with the most frequent value. Good for categorical or discrete data.</li>
                <li><strong>Fill 'Unknown'</strong> — Replaces nulls with the text "Unknown". Standard for categorical columns.</li>
                <li><strong>Forward fill</strong> — Copies the previous row's value. Best for time series data where values carry forward.</li>
                <li><strong>Drop rows</strong> — Removes entire rows with nulls. Use sparingly — you lose data.</li>
              </ul>
              <p className="font-semibold mt-2">Outlier handling:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Clip (IQR)</strong> — Caps extreme values at 1.5× the interquartile range. Keeps all rows but limits extreme values.</li>
                <li><strong>Remove rows</strong> — Deletes rows with outlier values entirely.</li>
              </ul>
              <p className="font-semibold mt-2">Encoding (applied during modeling):</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>One-Hot</strong> — Creates a binary column for each category (e.g., Color → Color_Red, Color_Blue). Best for ≤10 categories.</li>
                <li><strong>Label</strong> — Maps categories to numbers (A→0, B→1, C→2). Use when order matters or many categories exist.</li>
              </ul>
              <p className="font-semibold mt-2">Scaling (applied during modeling):</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Standard</strong> — Centers to mean=0, std=1. Required for KNN, SVM. Good practice for most models.</li>
                <li><strong>MinMax</strong> — Scales to [0, 1] range. Good when you need bounded values.</li>
              </ul>
              <p className="font-semibold mt-2">Why was each column's action recommended?</p>
              <p>Columns with &gt;60% nulls are auto-dropped (too sparse). Numeric nulls default to median (robust). Categorical nulls default to "Unknown". Outliers &gt;5% are auto-clipped. Categorical columns with ≤10 values get one-hot encoding.</p>
            </HelpBanner>
          </div>

          {/* Global settings */}
          <div className="glass-card rounded-xl p-5 mb-6">
            <h2 className="text-lg font-semibold mb-3">Global Settings</h2>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={plan.drop_duplicates}
                  onChange={(e) =>
                    setPlan({ ...plan, drop_duplicates: e.target.checked })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Remove duplicate rows
              </label>
              {plan.target_column && (
                <div className="text-sm text-gray-600">
                  Target:{" "}
                  <span className="font-medium text-blue-600">
                    {plan.target_column}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-2">(change in Step 1)</span>
                </div>
              )}
              {plan.dataset_type && (
                <div className="text-sm text-gray-600">
                  Type:{" "}
                  <span className="font-medium capitalize">
                    {plan.dataset_type.replace("_", " ")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Column treatments */}
          <div className="glass-card rounded-xl overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
              <div>
                <h2 className="text-lg font-semibold">
                  Column Treatments ({plan.treatments.length})
                </h2>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-2xl">
                  Expand each column to configure its treatment. <strong>Missing Values</strong> — choose how to fill gaps (median, mean, mode, or drop).
                  {" "}<strong>Outliers</strong> — clip extreme values or remove them.
                  {" "}<strong>Encoding</strong> — convert categorical text into numbers (One-Hot or Label).
                  {" "}<strong>Scaling</strong> — normalize numeric ranges (Standard or MinMax). Recommendations are shown below each column.
                </p>
              </div>
              <button
                onClick={() => {
                  if (expandedCols.size === plan.treatments.length) {
                    setExpandedCols(new Set());
                  } else {
                    setExpandedCols(
                      new Set(plan.treatments.map((t) => t.column))
                    );
                  }
                }}
                className="text-xs text-blue-600 hover:underline"
              >
                {expandedCols.size === plan.treatments.length
                  ? "Collapse all"
                  : "Expand all"}
              </button>
            </div>

            <div className="divide-y">
              {(showAllTreatments ? plan.treatments : plan.treatments.slice(0, 10)).map((t, idx) => {
                const colProfile = profile.columns.find(
                  (c) => c.name === t.column
                );
                const isExpanded = expandedCols.has(t.column);
                const isTarget = t.column === plan.target_column;
                const hasActions =
                  t.drop ||
                  (t.missing_strategy && t.missing_strategy !== "") ||
                  (t.outlier_strategy &&
                    t.outlier_strategy !== "" &&
                    t.outlier_strategy !== "none") ||
                  (t.encoding && t.encoding !== "" && t.encoding !== "none") ||
                  (t.scaling && t.scaling !== "" && t.scaling !== "none");

                return (
                  <div key={t.column}>
                    {/* Row header */}
                    <div
                      className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                        t.drop ? "opacity-50" : ""
                      }`}
                      onClick={() => toggleExpand(t.column)}
                    >
                      <span className="flex-1 text-sm font-medium">
                        {t.column}
                        {isTarget && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                            target
                          </span>
                        )}
                        {t.drop && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                            dropped
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400">
                        {colProfile?.dtype}
                      </span>
                      {colProfile && colProfile.nulls_pct > 0 && (
                        <span className="text-xs text-amber-600">
                          {colProfile.nulls_pct}% null
                        </span>
                      )}
                      {hasActions && !t.drop && (
                        <span className="text-xs text-blue-600">
                          {[
                            t.missing_strategy && t.missing_strategy !== ""
                              ? "impute"
                              : null,
                            t.outlier_strategy &&
                            t.outlier_strategy !== "" &&
                            t.outlier_strategy !== "none"
                              ? "outliers"
                              : null,
                            t.encoding &&
                            t.encoding !== "" &&
                            t.encoding !== "none"
                              ? "encode"
                              : null,
                            t.scaling &&
                            t.scaling !== "" &&
                            t.scaling !== "none"
                              ? "scale"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-400" />
                      )}
                    </div>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <div className="px-5 pb-4 bg-gray-50 border-t">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
                          {/* Missing */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Missing values
                            </label>
                            <select
                              value={t.missing_strategy || ""}
                              onChange={(e) =>
                                updateTreatment(idx, {
                                  missing_strategy: e.target.value || null,
                                })
                              }
                              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              {MISSING_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {t.missing_strategy === "fill_value" && (
                              <input
                                type="text"
                                value={t.fill_value || ""}
                                onChange={(e) =>
                                  updateTreatment(idx, {
                                    fill_value: e.target.value,
                                  })
                                }
                                placeholder="Enter value"
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            )}
                          </div>

                          {/* Outliers */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Outliers
                            </label>
                            <select
                              value={t.outlier_strategy || ""}
                              onChange={(e) =>
                                updateTreatment(idx, {
                                  outlier_strategy: e.target.value || null,
                                })
                              }
                              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              {OUTLIER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Encoding */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Encoding
                            </label>
                            <select
                              value={t.encoding || ""}
                              onChange={(e) =>
                                updateTreatment(idx, {
                                  encoding: e.target.value || null,
                                })
                              }
                              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              {ENCODING_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Scaling */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Scaling
                            </label>
                            <select
                              value={t.scaling || ""}
                              onChange={(e) =>
                                updateTreatment(idx, {
                                  scaling: e.target.value || null,
                                })
                              }
                              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              {SCALING_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Drop toggle */}
                        <div className="mt-3 flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-red-600">
                            <input
                              type="checkbox"
                              checked={t.drop || false}
                              onChange={(e) =>
                                updateTreatment(idx, { drop: e.target.checked })
                              }
                              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                            />
                            <Trash2 size={14} />
                            Drop this column
                          </label>
                        </div>

                        {/* Recommendation remarks */}
                        {t.recommendation && (
                          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-[10px] font-semibold text-blue-700 mb-1">Recommendation</p>
                            <div className="space-y-1">
                              {t.recommendation.split(" | ").map((remark, ri) => (
                                <p key={ri} className="text-xs text-blue-800">
                                  {remark}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {plan.treatments.length > 10 && (
              <div className="px-5 py-3 border-t bg-gray-50 text-center">
                <button
                  onClick={() => setShowAllTreatments(!showAllTreatments)}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  {showAllTreatments
                    ? "Show less"
                    : `Show all ${plan.treatments.length} columns (${plan.treatments.length - 10} more)`}
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={handleApply}
              disabled={applyLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applyLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Applying... ({Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")})
                </>
              ) : (
                <>
                  <Play size={16} />
                  Apply Cleaning Plan
                </>
              )}
            </button>
            <button
              onClick={generatePlan}
              disabled={planLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Reset to recommended
            </button>
          </div>
        </>
      )}

      {/* Apply loading overlay */}
      {applyLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-lg font-semibold text-gray-800 mt-4">
              Cleaning your data...
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Please wait — this may take up to 2 minutes for large datasets.
            </p>
            <p className="text-2xl font-mono font-bold text-blue-600 mt-3">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </p>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(95, elapsed * 2)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultsRef} className="space-y-6">
          {/* Health score before/after */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Activity size={20} className="text-blue-600" />
              Health Score — Before vs After
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HealthScoreCard title="Before Cleaning" score={result.health_before} />
              <HealthScoreCard title="After Cleaning" score={result.health_after} />
            </div>
            {result.health_before.total !== null &&
              result.health_after.total !== null && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <span className="text-sm font-medium text-blue-700">
                    Improvement:{" "}
                    <span className="text-lg font-bold">
                      {result.health_before.total} → {result.health_after.total}
                    </span>{" "}
                    <span
                      className={
                        result.health_after.total - result.health_before.total > 0
                          ? "text-green-600"
                          : "text-gray-500"
                      }
                    >
                      ({result.health_after.total - result.health_before.total > 0 ? "+" : ""}
                      {(
                        result.health_after.total - result.health_before.total
                      ).toFixed(1)}
                      )
                    </span>
                  </span>
                  {result.health_after.total - result.health_before.total === 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      The scores are identical — this is normal for clean datasets that had no missing values, outliers, or duplicates to fix.
                    </p>
                  )}
                </div>
              )}
          </div>

          {/* Summary */}
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-600" />
              Cleaning Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {result.rows_before.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">Rows before</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {result.rows_after.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">Rows after</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {result.cols_before}
                </p>
                <p className="text-xs text-gray-500">Cols before</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {result.cols_after}
                </p>
                <p className="text-xs text-gray-500">Cols after</p>
              </div>
            </div>

            {/* Treatment log */}
            {result.treatments_applied.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Actions Performed
                </h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {result.treatments_applied.map((log, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs bg-gray-50 rounded px-3 py-2"
                    >
                      <span className="font-medium text-gray-700 shrink-0 w-28 truncate">
                        {log.column}
                      </span>
                      <span className="text-blue-600 shrink-0 w-32">
                        {log.action}
                      </span>
                      <span className="text-gray-600">{log.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview cleaned data */}
          {result.preview_rows && result.column_names && (
            <div className="glass-card rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-3">
                Cleaned Data Preview (first {result.preview_rows.length} rows)
              </h2>
              <DatasetPreviewTable
                columns={result.column_names}
                rows={result.preview_rows}
              />
            </div>
          )}

          {/* Navigate to next step */}
          <div className="flex justify-end">
            <button
              onClick={() => navigate(`/model/${runId}`)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Continue to Modeling
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
