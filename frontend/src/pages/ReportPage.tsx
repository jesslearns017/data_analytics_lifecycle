import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { FileText, ArrowRight, Download } from "lucide-react";
import { getRun, type RunRecord } from "../storage/db";
import type { ProfileResponse } from "../types";
import LifecycleStepper from "../components/LifecycleStepper";
import LearnBanner from "../components/LearnBanner";

export default function ReportPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    getRun(runId).then((r) => {
      setRun(r ?? null);
      setLoading(false);
    });
  }, [runId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-gray-500">
          Run not found.{" "}
          <Link to="/upload" className="text-blue-600 underline">Upload a new dataset</Link>
        </p>
      </div>
    );
  }

  const profile = run.profile as ProfileResponse | undefined;
  const modelResults: any[] = (run.modelRuns as any[]) || [];
  const etlResult: any = run.report || null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="no-print">
        <LifecycleStepper currentStep={6} runId={runId} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={24} className="text-emerald-600" />
            Summary Report
          </h1>
          <p className="text-sm text-gray-500">{run.filename}</p>
        </div>
        <Link to={`/model/${runId}`} className="text-sm text-blue-600 hover:underline no-print">
          ← Back to Modeling
        </Link>
      </div>

      <div className="no-print">
      <LearnBanner stepNumber={6} title="Deploy DA Insights — Visualize and Present Your Findings">
        <p>
          The final step is <strong>deploying your insights</strong>. You've defined a problem,
          collected data, cleaned and enriched it, and built models. Now you need to <strong>summarize your findings</strong> in
          a way that anyone can understand — even someone who wasn't part of the analysis.
        </p>
        <p>
          <strong>Data visualization is crucial</strong> in communicating findings. Not all stakeholders are data-savvy — being able to
          <strong>tell a story with your data</strong> is essential. A good report explains the value of your findings clearly.
        </p>
        <p>
          A good report answers: <strong>What did we find?</strong> <strong>Why does it matter?</strong> and <strong>What should we do next?</strong>
        </p>
      </LearnBanner>
      </div>

      {/* Section 1: Dataset Overview */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-emerald-700">1. Dataset Overview</h2>
        {profile ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
            <StatCard label="Rows" value={profile.rows.toLocaleString()} />
            <StatCard label="Columns" value={String(profile.cols)} />
            <StatCard label="Duplicates" value={String(profile.duplicates_count)} />
            <StatCard
              label="Missing Cells"
              value={profile.columns.reduce((s, c) => s + c.nulls_count, 0).toLocaleString()}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-400">No profile data available. Go back to Upload to start.</p>
        )}
        {profile?.dataset_type && (
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              <strong>Detected type:</strong>{" "}
              <span className="capitalize">{profile.dataset_type.detected_type.replace("_", " ")}</span>
              {profile.dataset_type.suggested_target && (
                <> — Target: <strong>{profile.dataset_type.suggested_target}</strong></>
              )}
            </p>
            {profile.dataset_type.type_reason && (
              <p className="text-xs text-gray-500">{profile.dataset_type.type_reason}</p>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Data Quality */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-emerald-700">2. Data Quality & Cleaning</h2>
        {etlResult ? (
          <div className="space-y-3">
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs text-gray-500">Health Score Before</p>
                <p className="text-2xl font-bold text-gray-700">{etlResult.health_before?.total ?? "—"}</p>
              </div>
              <div className="text-2xl text-gray-300">→</div>
              <div>
                <p className="text-xs text-gray-500">Health Score After</p>
                <p className="text-2xl font-bold text-emerald-600">{etlResult.health_after?.total ?? "—"}</p>
              </div>
              {etlResult.health_before?.total != null && etlResult.health_after?.total != null && (
                <div>
                  <p className="text-xs text-gray-500">Improvement</p>
                  <p className={`text-2xl font-bold ${
                    etlResult.health_after.total - etlResult.health_before.total > 0
                      ? "text-green-600" : "text-gray-500"
                  }`}>
                    {etlResult.health_after.total - etlResult.health_before.total > 0 ? "+" : ""}
                    {(etlResult.health_after.total - etlResult.health_before.total).toFixed(1)}
                  </p>
                </div>
              )}
            </div>
            {etlResult.treatment_log && etlResult.treatment_log.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Actions taken:</p>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {etlResult.treatment_log.slice(0, 10).map((log: any, i: number) => (
                    <li key={i}>• {log.column}: {log.action} {log.detail ? `(${log.detail})` : ""}</li>
                  ))}
                  {etlResult.treatment_log.length > 10 && (
                    <li className="text-gray-400">... and {etlResult.treatment_log.length - 10} more actions</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No cleaning results saved yet. Apply the ETL plan on the{" "}
            <Link to={`/etl/${runId}`} className="text-blue-600 underline">Data Cleaning page</Link> first.
          </p>
        )}
      </div>

      {/* Section 3: Model Performance */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-emerald-700">3. Model Performance</h2>
        {modelResults.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium text-right">Primary Metric</th>
                    <th className="px-3 py-2 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {modelResults.map((r: any, i: number) => {
                    const metric = r.classification_metrics
                      ? { name: "F1 Score", value: r.classification_metrics.f1 }
                      : r.regression_metrics
                      ? { name: "R²", value: r.regression_metrics.r2 }
                      : { name: "—", value: "—" };
                    return (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium capitalize">{r.model_name?.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 capitalize text-gray-500">{r.problem_type}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{metric.name}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{metric.value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Best model callout */}
            {(() => {
              const cls = modelResults.filter((r: any) => r.classification_metrics);
              const reg = modelResults.filter((r: any) => r.regression_metrics);
              const best = cls.length > 0
                ? cls.reduce((a: any, b: any) => a.classification_metrics.f1 > b.classification_metrics.f1 ? a : b)
                : reg.length > 0
                ? reg.reduce((a: any, b: any) => a.regression_metrics.r2 > b.regression_metrics.r2 ? a : b)
                : null;
              if (!best) return null;
              const metricVal = best.classification_metrics
                ? `F1 = ${best.classification_metrics.f1}, Accuracy = ${(best.classification_metrics.accuracy * 100).toFixed(1)}%`
                : `R² = ${best.regression_metrics.r2}, RMSE = ${best.regression_metrics.rmse}`;
              return (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-emerald-800">
                    Best model: <strong className="capitalize">{best.model_name?.replace(/_/g, " ")}</strong> — {metricVal}
                  </p>
                </div>
              );
            })()}

            {/* Top features */}
            {(() => {
              const latest = modelResults[modelResults.length - 1];
              if (!latest?.feature_importance || latest.feature_importance.length === 0) return null;
              const top5 = [...latest.feature_importance]
                .sort((a: any, b: any) => Math.abs(b.importance) - Math.abs(a.importance))
                .slice(0, 5);
              return (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Top features (latest model):</p>
                  <div className="flex flex-wrap gap-2">
                    {top5.map((f: any, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 rounded-full px-3 py-1 font-medium">
                        {f.feature}: {f.importance.toFixed(3)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No models trained yet. Train models on the{" "}
            <Link to={`/model/${runId}`} className="text-blue-600 underline">Modeling page</Link> first.
          </p>
        )}
      </div>

      {/* Section 4: Recommendations */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3 text-emerald-700">4. Recommendations & Next Steps</h2>
        <Recommendations profile={profile} modelResults={modelResults} etlResult={etlResult} />
      </div>

      {/* Print button */}
      <div className="flex justify-center mt-8 mb-4 no-print">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          <Download size={16} />
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-gray-800">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

function Recommendations({
  profile,
  modelResults,
  etlResult,
}: {
  profile?: ProfileResponse;
  modelResults: any[];
  etlResult: any;
}) {
  const recs: string[] = [];

  // Data quality recs
  if (profile) {
    const missingPct =
      profile.columns.reduce((s, c) => s + c.nulls_pct, 0) / profile.columns.length;
    if (missingPct > 20) {
      recs.push(
        "The dataset has significant missing data. Consider collecting more complete data or investigating why values are missing."
      );
    }
    if (profile.duplicates_count > 0) {
      recs.push(
        `${profile.duplicates_count} duplicate rows were found. Verify these are true duplicates and not valid repeated measurements.`
      );
    }
  }

  // ETL recs
  if (etlResult?.health_after?.total != null) {
    if (etlResult.health_after.total < 70) {
      recs.push(
        "Data health score is below 70 after cleaning. Consider more aggressive preprocessing or collecting higher-quality data."
      );
    }
  }

  // Model recs
  if (modelResults.length === 0) {
    recs.push("No models have been trained yet. Return to the Modeling page to train and compare models.");
  } else if (modelResults.length === 1) {
    recs.push(
      "Only one model was trained. Try at least 2-3 different models to compare and ensure you're not missing a better approach."
    );
  }

  const cls = modelResults.filter((r: any) => r.classification_metrics);
  const reg = modelResults.filter((r: any) => r.regression_metrics);

  if (cls.length > 0) {
    const bestF1 = Math.max(...cls.map((r: any) => r.classification_metrics.f1));
    if (bestF1 < 0.6) {
      recs.push(
        "The best F1 score is below 0.60, indicating weak predictive power. Consider feature engineering, collecting more data, or trying ensemble models."
      );
    } else if (bestF1 >= 0.9) {
      recs.push(
        "Excellent performance (F1 ≥ 0.90). Verify this isn't due to data leakage — check that no feature is derived from the target."
      );
    }
  }

  if (reg.length > 0) {
    const bestR2 = Math.max(...reg.map((r: any) => r.regression_metrics.r2));
    if (bestR2 < 0.5) {
      recs.push(
        "The best R² is below 0.50, meaning the model explains less than half the variance. Consider adding more predictive features or trying non-linear models."
      );
    } else if (bestR2 > 0.95) {
      recs.push(
        "Very high R² (>0.95). Double-check for overfitting or data leakage — try cross-validation to confirm."
      );
    }
  }

  if (recs.length === 0) {
    recs.push(
      "The analysis looks solid. Consider deploying the best model, monitoring its performance over time, and re-training periodically with fresh data."
    );
  }

  return (
    <ul className="space-y-2">
      {recs.map((rec, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <ArrowRight size={14} className="text-emerald-500 shrink-0 mt-0.5" />
          {rec}
        </li>
      ))}
    </ul>
  );
}
