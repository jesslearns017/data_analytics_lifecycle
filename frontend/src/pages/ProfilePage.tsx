import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getRun, type RunRecord } from "../storage/db";
import type { ProfileResponse } from "../types";
import CorrelationHeatmap from "../components/CorrelationHeatmap";
import { HelpBanner } from "../components/HelpTip";
import LifecycleStepper from "../components/LifecycleStepper";
import LearnBanner from "../components/LearnBanner";

export default function ProfilePage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllColumns, setShowAllColumns] = useState(false);

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
      <LifecycleStepper currentStep={2} runId={runId} />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-gray-500">{run.filename}</p>
        </div>
        <Link
          to="/upload"
          className="text-sm text-blue-600 hover:underline"
        >
          Upload new
        </Link>
      </div>

      <LearnBanner stepNumber={2} title="Collect the Data (Get the Data) — Understand Your Dataset">
        <p>
          Now that you've collected your data, you need to <strong>understand it</strong> before making any changes.
          Identify key variables, look for errors — omitted data, duplicates, values that don't logically make sense, or spelling errors. These issues need to be identified so you can properly clean your data in the next step.
        </p>
        <p>
          • <strong>KPI tiles</strong> — Quick stats: how many rows, columns, duplicates, and missing values exist.<br />
          • <strong>Dataset type detection</strong> — The system detects whether this is a classification, regression, or time series problem and suggests a target column.<br />
          • <strong>Column details</strong> — Each column's data type, unique values, nulls, and basic statistics. Look for columns with high null % or unexpected types.<br />
          • <strong>Correlation matrix</strong> — Shows relationships between numeric columns. Helps identify useful predictors and redundant features.<br />
          • <strong>Missing values chart</strong> — Visualizes which columns have gaps. Columns with many missing values may need special handling or removal.
        </p>
      </LearnBanner>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <KpiTile label="Rows" value={profile.rows.toLocaleString()} />
        <KpiTile label="Columns" value={String(profile.cols)} />
        <KpiTile label="Duplicates" value={String(profile.duplicates_count)} />
        <KpiTile
          label="Missing cells"
          value={profile.columns
            .reduce((s, c) => s + c.nulls_count, 0)
            .toLocaleString()}
        />
      </div>

      {/* Dataset type card — with inline explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <div>
            <p className="text-xs font-medium text-blue-600">Detected type</p>
            <p className="text-lg font-semibold capitalize">
              {profile.dataset_type.detected_type.replace("_", " ")}
            </p>
          </div>
          {profile.dataset_type.suggested_target && (
            <div className="border-l border-blue-200 pl-4">
              <p className="text-xs text-gray-500">Suggested target</p>
              <p className="text-sm font-medium">
                {profile.dataset_type.suggested_target}
              </p>
            </div>
          )}
          {profile.dataset_type.suggested_time_col && (
            <div className="border-l border-blue-200 pl-4">
              <p className="text-xs text-gray-500">Time column</p>
              <p className="text-sm font-medium">
                {profile.dataset_type.suggested_time_col}
              </p>
            </div>
          )}
          {profile.dataset_type.suggested_entity_col && (
            <div className="border-l border-blue-200 pl-4">
              <p className="text-xs text-gray-500">Entity column</p>
              <p className="text-sm font-medium">
                {profile.dataset_type.suggested_entity_col}
              </p>
            </div>
          )}
        </div>

        {/* Inline explanation — uses backend-provided reasons */}
        <div className="border-t border-blue-200 pt-3 text-xs text-gray-700 space-y-1.5">
          <p>
            <strong>Why "{profile.dataset_type.detected_type.replace("_", " ")}"?</strong>{" "}
            {profile.dataset_type.type_reason ||
              "The system analyzed your columns and selected this type based on data characteristics."}
          </p>
          {profile.dataset_type.suggested_target && (
            <p>
              <strong>Why "{profile.dataset_type.suggested_target}" as target?</strong>{" "}
              {profile.dataset_type.target_reason ||
                "Selected based on column position and data characteristics."}{" "}
              You can change the target on the Modeling page.
            </p>
          )}
        </div>
      </div>

      {/* Schema table */}
      <div className="glass-card rounded-xl overflow-hidden mb-4">
        <h2 className="text-lg font-semibold px-5 py-3 border-b bg-gray-50">
          Column Details
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-2 font-medium">Column</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Unique</th>
                <th className="px-4 py-2 font-medium">Nulls</th>
                <th className="px-4 py-2 font-medium">Null %</th>
                <th className="px-4 py-2 font-medium">Stats / Top values</th>
              </tr>
            </thead>
            <tbody>
              {(showAllColumns ? profile.columns : profile.columns.slice(0, 10)).map((col) => (
                <tr key={col.name} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {col.name}
                    {col.datetime_candidate && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                        datetime
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{col.dtype}</td>
                  <td className="px-4 py-2">{col.n_unique}</td>
                  <td className="px-4 py-2">{col.nulls_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        col.nulls_pct > 10
                          ? "text-red-600 font-medium"
                          : col.nulls_pct > 0
                          ? "text-amber-600"
                          : "text-gray-400"
                      }
                    >
                      {col.nulls_pct}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {col.numeric_summary ? (
                      <span>
                        mean={col.numeric_summary.mean}, std=
                        {col.numeric_summary.std}, [{col.numeric_summary.min}
                        ..{col.numeric_summary.max}]
                        {col.outlier_estimate &&
                          col.outlier_estimate.count > 0 && (
                            <span className="ml-1 text-amber-600">
                              ({col.outlier_estimate.count} outliers)
                            </span>
                          )}
                      </span>
                    ) : col.top_values ? (
                      <span>
                        {col.top_values
                          .slice(0, 3)
                          .map((tv) => `${tv.value} (${tv.count})`)
                          .join(", ")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profile.columns.length > 10 && (
          <div className="px-5 py-3 border-t bg-gray-50 text-center">
            <button
              onClick={() => setShowAllColumns(!showAllColumns)}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              {showAllColumns
                ? "Show less"
                : `Show all ${profile.columns.length} columns (${profile.columns.length - 10} more)`}
            </button>
          </div>
        )}
      </div>

      {/* Correlation heatmap */}
      {profile.correlation && (
        <div className="glass-card rounded-xl p-5 mb-4">
          <h2 className="text-lg font-semibold mb-3">Correlation Matrix</h2>
          <CorrelationHeatmap correlation={profile.correlation} />
        </div>
      )}
      {profile.correlation && (
        <div className="mb-8">
          <HelpBanner title="How to read the Correlation Matrix">
            <p>
              The correlation matrix shows <strong>Pearson correlation coefficients (r)</strong> between every pair of numeric columns. Values range from <strong>-1 to +1</strong>:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>+1.0 (dark red)</strong> — Perfect positive correlation. As one variable increases, the other always increases proportionally.</li>
              <li><strong>0.0 (white)</strong> — No linear relationship between the variables.</li>
              <li><strong>-1.0 (dark blue)</strong> — Perfect negative correlation. As one increases, the other always decreases.</li>
            </ul>
            <p><strong>What to look for:</strong></p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Strong correlations (&gt;0.7 or &lt;-0.7)</strong> between features may indicate redundancy (multicollinearity). Consider dropping one.</li>
              <li><strong>Correlation with the target</strong> — features strongly correlated with your target are likely good predictors.</li>
              <li><strong>Low correlation features</strong> may add noise rather than signal to your model.</li>
            </ul>
            <p className="text-gray-500 italic">Note: Correlation only measures linear relationships. Non-linear patterns (curves, thresholds) won't show up here.</p>
          </HelpBanner>
        </div>
      )}

      {/* Nulls bar chart */}
      {profile.columns.some((c) => c.nulls_count > 0) && (
        <div className="glass-card rounded-xl p-5 mb-8">
          <h2 className="text-lg font-semibold mb-3">Missing Values</h2>
          <div className="space-y-2">
            {profile.columns
              .filter((c) => c.nulls_count > 0)
              .sort((a, b) => b.nulls_pct - a.nulls_pct)
              .map((col) => (
                <div key={col.name} className="flex items-center gap-3">
                  <span className="w-36 text-sm text-gray-700 truncate">
                    {col.name}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full transition-all"
                      style={{ width: `${Math.max(col.nulls_pct, 1)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {col.nulls_pct}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Continue to ETL */}
      <div className="flex justify-end">
        <button
          onClick={() => navigate(`/etl/${runId}`)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Continue to Data Cleaning
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-blue-600">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
