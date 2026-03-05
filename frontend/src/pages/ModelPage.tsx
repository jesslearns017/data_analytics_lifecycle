import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Brain,
  Play,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import Plot from "react-plotly.js";
import { getRun, updateRun, type RunRecord } from "../storage/db";
import type { ProfileResponse } from "../types";
import { trainModel, type ModelTrainConfig } from "../api/modeling";
import { HelpBanner } from "../components/HelpTip";
import LifecycleStepper from "../components/LifecycleStepper";
import LearnBanner from "../components/LearnBanner";

// ---------------------------------------------------------------------------
// Model definitions
// ---------------------------------------------------------------------------

type ModelDef = {
  value: string;
  label: string;
  type: "classification" | "regression";
  params: ParamDef[];
};

type ParamDef = {
  key: string;
  label: string;
  kind: "slider" | "select";
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  options?: { value: string; label: string }[];
  tooltip?: string;
};

const MODELS: ModelDef[] = [
  // Regression
  {
    value: "linear_regression",
    label: "Linear Regression",
    type: "regression",
    params: [],
  },
  {
    value: "polynomial_regression",
    label: "Polynomial Regression",
    type: "regression",
    params: [
      { key: "degree", label: "Degree", kind: "slider", min: 2, max: 5, step: 1, default: 2 },
    ],
  },
  {
    value: "decision_tree_regressor",
    label: "Decision Tree (Reg)",
    type: "regression",
    params: [
      { key: "max_depth", label: "Max Depth", kind: "slider", min: 1, max: 20, step: 1, default: 5 },
    ],
  },
  {
    value: "random_forest_regressor",
    label: "Random Forest (Reg)",
    type: "regression",
    params: [
      { key: "n_estimators", label: "Trees", kind: "slider", min: 50, max: 300, step: 50, default: 100 },
    ],
  },
  {
    value: "gradient_boosting_regressor",
    label: "Gradient Boosting (Reg)",
    type: "regression",
    params: [
      { key: "n_estimators", label: "Trees", kind: "slider", min: 50, max: 300, step: 50, default: 100 },
      { key: "learning_rate", label: "Learning Rate", kind: "slider", min: 0.01, max: 0.5, step: 0.01, default: 0.1 },
    ],
  },
  // Classification
  {
    value: "logistic_regression",
    label: "Logistic Regression",
    type: "classification",
    params: [],
  },
  {
    value: "naive_bayes",
    label: "Naive Bayes",
    type: "classification",
    params: [],
  },
  {
    value: "decision_tree_classifier",
    label: "Decision Tree (Cls)",
    type: "classification",
    params: [
      { key: "max_depth", label: "Max Depth", kind: "slider", min: 1, max: 20, step: 1, default: 5 },
    ],
  },
  {
    value: "random_forest_classifier",
    label: "Random Forest (Cls)",
    type: "classification",
    params: [
      { key: "n_estimators", label: "Trees", kind: "slider", min: 50, max: 300, step: 50, default: 100 },
    ],
  },
  {
    value: "gradient_boosting_classifier",
    label: "Gradient Boosting (Cls)",
    type: "classification",
    params: [
      { key: "n_estimators", label: "Trees", kind: "slider", min: 50, max: 300, step: 50, default: 100 },
      { key: "learning_rate", label: "Learning Rate", kind: "slider", min: 0.01, max: 0.5, step: 0.01, default: 0.1 },
    ],
  },
  {
    value: "knn_classifier",
    label: "K-Nearest Neighbors",
    type: "classification",
    params: [
      { key: "k", label: "K (neighbors)", kind: "slider", min: 1, max: 25, step: 2, default: 5 },
    ],
  },
  {
    value: "svm_classifier",
    label: "SVM",
    type: "classification",
    params: [
      {
        key: "kernel",
        label: "Kernel",
        kind: "select",
        default: "rbf",
        options: [
          { value: "linear", label: "Linear" },
          { value: "rbf", label: "RBF" },
        ],
      },
      { key: "C", label: "C (regularization)", kind: "slider", min: 0.01, max: 10, step: 0.1, default: 1.0 },
    ],
  },
];

const FEATURE_SELECTION_METHODS = [
  { value: "none", label: "All features" },
  { value: "manual", label: "Manual selection" },
  { value: "forward", label: "Forward selection" },
  { value: "backward", label: "Backward elimination" },
  { value: "lasso", label: "Lasso regularization" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModelPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [selectedModel, setSelectedModel] = useState<string>("random_forest_classifier");
  const [target, setTarget] = useState<string>("");
  const [testSize, setTestSize] = useState(0.2);
  const [hyperparams, setHyperparams] = useState<Record<string, number | string>>({});
  const [featureMethod, setFeatureMethod] = useState("none");
  const [manualFeatures, setManualFeatures] = useState<Set<string>>(new Set());
  const [maxFeatures, setMaxFeatures] = useState(10);
  const [featureEngineering, setFeatureEngineering] = useState(false);
  const [useSmote, setUseSmote] = useState(false);
  const [cvFolds, setCvFolds] = useState(5);
  const [sampleEnabled, setSampleEnabled] = useState(false);
  const [sampleSize, setSampleSize] = useState(10000);

  // Training state
  const [training, setTraining] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<any>(null);
  const [allResults, setAllResults] = useState<any[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [showFeatures, setShowFeatures] = useState(false);

  // Load run
  useEffect(() => {
    if (!runId) return;
    getRun(runId).then((r) => {
      setRun(r ?? null);
      if (r?.modelRuns && Array.isArray(r.modelRuns)) {
        setAllResults(r.modelRuns as any[]);
      }
      // Auto-set target from profile
      const profile = r?.profile as ProfileResponse | undefined;
      if (profile?.dataset_type.suggested_target) {
        setTarget(profile.dataset_type.suggested_target);
      }
      setLoading(false);
    });
  }, [runId]);

  // Reset hyperparams when model changes
  useEffect(() => {
    const modelDef = MODELS.find((m) => m.value === selectedModel);
    if (modelDef) {
      const defaults: Record<string, number | string> = {};
      modelDef.params.forEach((p) => {
        defaults[p.key] = p.default;
      });
      setHyperparams(defaults);
    }
  }, [selectedModel]);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleTrain = useCallback(async () => {
    if (!run) return;
    const file = run.cleanedBlob || run.fileBlob;
    if (!file) {
      setError("No dataset file found. Please go back and apply ETL first.");
      return;
    }
    if (!target) {
      setError("Please select a target column.");
      return;
    }

    setTraining(true);
    setError(null);
    setResult(null);
    startTimer();

    const modelDef = MODELS.find((m) => m.value === selectedModel);
    const problemType = modelDef?.type || "auto";

    const config: ModelTrainConfig = {
      target,
      problem_type: problemType,
      model_name: selectedModel,
      config: {
        test_size: testSize,
        random_seed: 42,
        ...(hyperparams.n_estimators !== undefined && { n_estimators: Number(hyperparams.n_estimators) }),
        ...(hyperparams.max_depth !== undefined && { max_depth: Number(hyperparams.max_depth) }),
        ...(hyperparams.learning_rate !== undefined && { learning_rate: Number(hyperparams.learning_rate) }),
        ...(hyperparams.degree !== undefined && { degree: Number(hyperparams.degree) }),
        ...(hyperparams.k !== undefined && { k: Number(hyperparams.k) }),
        ...(hyperparams.kernel !== undefined && { kernel: String(hyperparams.kernel) }),
        ...(hyperparams.C !== undefined && { C: Number(hyperparams.C) }),
        apply_scaling: selectedModel === "knn_classifier" || selectedModel === "svm_classifier",
      },
      feature_selection: {
        method: featureMethod,
        ...(featureMethod === "manual" && { selected_features: Array.from(manualFeatures) }),
        ...(["forward", "backward"].includes(featureMethod) && { max_features: maxFeatures }),
      },
      feature_engineering: {
        enabled: featureEngineering,
      },
    };
    // Add CV folds, SMOTE, and sample size to config
    config.config.cv_folds = cvFolds;
    config.config.use_smote = useSmote;
    if (sampleEnabled && sampleSize > 0) {
      (config.config as any).sample_size = sampleSize;
    }

    try {
      const res = await trainModel(file, run.filename, config);
      setResult(res);
      const updated = [...allResults, res];
      setAllResults(updated);
      if (runId) {
        await updateRun(runId, { modelRuns: updated });
      }
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Training failed.";
      setError(msg);
    } finally {
      stopTimer();
      setTraining(false);
    }
  }, [run, target, selectedModel, testSize, hyperparams, featureMethod, manualFeatures, maxFeatures, runId, allResults]);

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
  const columnNames = profile?.column_names || [];
  const featureColumns = columnNames.filter((c) => c !== target);
  const modelDef = MODELS.find((m) => m.value === selectedModel);
  const isDistanceBased = selectedModel === "knn_classifier" || selectedModel === "svm_classifier";

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <LifecycleStepper currentStep={5} runId={runId} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain size={24} className="text-purple-600" />
            Modeling
          </h1>
          <p className="text-sm text-gray-500">{run.filename}</p>
        </div>
        <Link to={`/etl/${runId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to ETL
        </Link>
      </div>

      <LearnBanner stepNumber={5} title="Analyze the Data (Find Insights and Visualize)">
        <p>
          Now that your data is clean and enriched, begin building models to test your data and seek answers to the objectives defined in Step 1. Using different <strong>statistical modeling methods</strong>, you can determine which is best for your data.
        </p>
        <p>
          <strong>How it works:</strong> Your data is split into a <strong>training set</strong> (the model learns from this) and a <strong>test set</strong> (used to check if the model actually learned, not just memorized). Performance is measured on test data only.
        </p>
        <p>
          Common models include <strong>linear regressions</strong>, <strong>decision trees</strong>, <strong>random forests</strong>, <strong>gradient boosting</strong>, and others.
          <strong>Classification</strong> models predict categories (e.g., "Yes/No"). <strong>Regression</strong> models predict numbers (e.g., "What will the price be?").
        </p>
        <p>
          <strong>Validate your results:</strong> Did the models work properly? Does the data need more cleaning? Did you find the outcome the client was looking for? If not, you may need to go back to previous steps. <strong>Expect trial and error!</strong>
        </p>
        <p>
          Try multiple models and compare them — there's no single "best" model for all data. The comparison table at the bottom helps you see which one works best for <em>your</em> specific dataset.
        </p>
      </LearnBanner>

      {error && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
          error.toLowerCase().includes("mismatch")
            ? "bg-amber-50 border border-amber-300"
            : "bg-red-50 border border-red-200"
        }`}>
          <AlertCircle className={`shrink-0 mt-0.5 ${
            error.toLowerCase().includes("mismatch") ? "text-amber-500" : "text-red-500"
          }`} size={18} />
          <div>
            <p className={`text-sm font-medium ${
              error.toLowerCase().includes("mismatch") ? "text-amber-800" : "text-red-700"
            }`}>
              {error.toLowerCase().includes("mismatch") ? "Wrong model type for this data" : "Error"}
            </p>
            <p className={`text-sm mt-1 ${
              error.toLowerCase().includes("mismatch") ? "text-amber-700" : "text-red-600"
            }`}>{error}</p>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Target + Model picker */}
        <div className="space-y-3">
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">Model Setup</h2>

            {/* Target column */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Target Column</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 font-medium">
                  {target || "No target set"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Changing the target requires re-running profiling and cleaning from Step 1. Go back to Upload?")) {
                      navigate(`/upload`);
                    }
                  }}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  Change target
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Target is set in Step 1 (Upload). Changing it requires re-running the pipeline.</p>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <optgroup label="Regression">
                  {MODELS.filter((m) => m.type === "regression").map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Classification">
                  {MODELS.filter((m) => m.type === "classification").map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Test size */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Test Size: {(testSize * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0.1}
                max={0.4}
                step={0.05}
                value={testSize}
                onChange={(e) => setTestSize(parseFloat(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>

            {isDistanceBased && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Scaling recommended for distance-based models. Auto-scaling is enabled.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Hyperparameters column: help banner on top */}
        <div className="space-y-3">
          <HelpBanner title="What are hyperparameters?">
            <p><strong>Hyperparameters</strong> are settings you choose <em>before</em> training — they control how the model learns:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Trees (n_estimators)</strong> — Number of decision trees in an ensemble. More trees = more stable but slower. Start with 100.</li>
              <li><strong>Max Depth</strong> — How deep each tree grows. Deeper = more complex but risks overfitting. Try 3-10.</li>
              <li><strong>Learning Rate</strong> — How much each tree corrects the previous (Gradient Boosting). 0.05-0.2 is typical.</li>
              <li><strong>Degree</strong> — Polynomial degree. 2 = quadratic, 3+ = more flexible but risk overfitting.</li>
              <li><strong>K (neighbors)</strong> — How many nearby points KNN considers. Low K = noisy, high K = smooth. Use odd numbers.</li>
              <li><strong>Kernel (SVM)</strong> — Linear = straight boundary. RBF = curved boundary for non-linear data.</li>
              <li><strong>C (SVM)</strong> — Low C = wider margin (generalized). High C = tighter margin (fits training data closely).</li>
            </ul>
            <p className="text-gray-500 italic mt-1">Tip: Start with defaults, then adjust one parameter at a time.</p>
          </HelpBanner>
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">Hyperparameters</h2>
          {modelDef && modelDef.params.length > 0 ? (
            modelDef.params.map((p) => (
              <div key={p.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {p.label}: {hyperparams[p.key] ?? p.default}
                </label>
                {p.kind === "slider" ? (
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={Number(hyperparams[p.key] ?? p.default)}
                    onChange={(e) =>
                      setHyperparams({ ...hyperparams, [p.key]: parseFloat(e.target.value) })
                    }
                    className="w-full accent-purple-600"
                  />
                ) : (
                  <select
                    value={String(hyperparams[p.key] ?? p.default)}
                    onChange={(e) =>
                      setHyperparams({ ...hyperparams, [p.key]: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    {p.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400">No hyperparameters for this model.</p>
          )}
          </div>
        </div>

        {/* Feature selection column: help banner on top */}
        <div className="space-y-3">
          <HelpBanner title="What is feature selection?">
            <p><strong>Feature selection</strong> picks which columns the model uses as inputs. Fewer, better features often outperform using everything:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>All features</strong> — Use everything. Simple but may include noise.</li>
              <li><strong>Manual</strong> — You pick. Select 1 feature = "simple regression". Select many = "multiple regression".</li>
              <li><strong>Forward selection</strong> — Starts empty, adds the best feature one at a time.</li>
              <li><strong>Backward elimination</strong> — Starts with all, removes the worst one at a time.</li>
              <li><strong>Lasso</strong> — Uses L1 regularization to zero out unimportant features. Fast and automatic.</li>
            </ul>
            <p className="text-gray-500 italic mt-1">Forward/Backward can be slow (up to 3 min) because they train many times internally.</p>
          </HelpBanner>
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">Feature Selection</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
              <select
                value={featureMethod}
                onChange={(e) => setFeatureMethod(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              >
                {FEATURE_SELECTION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {featureMethod === "manual" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">
                    Features ({manualFeatures.size} of {featureColumns.length})
                  </label>
                  <button
                    onClick={() => setShowFeatures(!showFeatures)}
                    className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                  >
                    {showFeatures ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showFeatures ? "Hide" : "Show"}
                  </button>
                </div>
                {showFeatures && (
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setManualFeatures(new Set(featureColumns))}
                        className="text-[10px] text-purple-600 hover:underline"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setManualFeatures(new Set())}
                        className="text-[10px] text-purple-600 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    {featureColumns.map((col) => (
                      <label key={col} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={manualFeatures.has(col)}
                          onChange={(e) => {
                            const next = new Set(manualFeatures);
                            if (e.target.checked) next.add(col);
                            else next.delete(col);
                            setManualFeatures(next);
                          }}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        {col}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  Pick 1 = simple regression, pick many = multiple regression
                </p>
              </div>
            )}

            {["forward", "backward"].includes(featureMethod) && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Max Features: {maxFeatures}
                </label>
                <input
                  type="range"
                  min={1}
                  max={Math.max(featureColumns.length, 1)}
                  step={1}
                  value={maxFeatures}
                  onChange={(e) => setMaxFeatures(parseInt(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced options: Feature Engineering, SMOTE, CV Folds */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">Advanced Options</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sample rows */}
          <div>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={sampleEnabled}
                onChange={(e) => setSampleEnabled(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <div>
                <span className="font-medium">Sample rows</span>
                <p className="text-[10px] text-gray-400">Reduce dataset for faster training</p>
              </div>
            </label>
            {sampleEnabled && (
              <input
                type="number"
                min={100}
                max={100000}
                step={1000}
                value={sampleSize}
                onChange={(e) => setSampleSize(parseInt(e.target.value) || 10000)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Max rows"
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={featureEngineering}
              onChange={(e) => setFeatureEngineering(e.target.checked)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <div>
              <span className="font-medium">Auto Feature Engineering</span>
              <p className="text-[10px] text-gray-400">Log transforms, binning, interactions</p>
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useSmote}
              onChange={(e) => setUseSmote(e.target.checked)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <div>
              <span className="font-medium">SMOTE (Balance Classes)</span>
              <p className="text-[10px] text-gray-400">Oversample minority class (classification only)</p>
            </div>
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cross-Validation Folds: {cvFolds}
            </label>
            <input
              type="range"
              min={2}
              max={10}
              step={1}
              value={cvFolds}
              onChange={(e) => setCvFolds(parseInt(e.target.value))}
              className="w-full accent-purple-600"
            />
            <p className="text-[10px] text-gray-400">k-fold CV on training data (0 = disabled)</p>
          </div>
        </div>
      </div>

      {/* Train button */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handleTrain}
          disabled={training || !target}
          className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={16} />
          Train Model
        </button>
        {allResults.length > 0 && (
          <span className="text-sm text-gray-500">
            {allResults.length} model(s) trained this session
          </span>
        )}
      </div>

      {/* How results are calculated — shown after Train button */}
      <div className="mb-8">
        <HelpBanner title="How are results calculated?">
          <p><strong>Classification metrics:</strong></p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Accuracy</strong> — % of correct predictions overall. Can be misleading if classes are imbalanced.</li>
            <li><strong>Precision</strong> — Of all predicted positives, how many were actually positive? High precision = few false alarms.</li>
            <li><strong>Recall</strong> — Of all actual positives, how many did we catch? High recall = few missed cases.</li>
            <li><strong>F1 Score</strong> — Harmonic mean of precision and recall. Best single metric when classes are imbalanced.</li>
            <li><strong>ROC AUC</strong> — Area under the ROC curve. 1.0 = perfect, 0.5 = random guessing. Only for binary classification.</li>
          </ul>
          <p className="mt-1"><strong>Regression metrics:</strong></p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>R² (R-squared)</strong> — % of variance explained. 1.0 = perfect, 0 = no better than the mean, negative = worse than the mean.</li>
            <li><strong>MAE</strong> — Average absolute error. "Predictions are off by X on average."</li>
            <li><strong>RMSE</strong> — Root mean squared error. Penalizes large errors more. If RMSE ≫ MAE, you have some big misses.</li>
          </ul>
          <p className="text-gray-500 italic mt-1">All metrics are on the <strong>test set only</strong> — data the model never saw during training.</p>
          <p className="mt-2"><strong>Advanced options:</strong></p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Cross-Validation (k-fold)</strong> — Splits training data into k parts, trains k times (each time holding 1 part out), and averages the scores. Gives a more reliable estimate than a single train/test split. Low std = stable model.</li>
            <li><strong>Feature Engineering</strong> — Automatically creates new features: log transforms for skewed data, quantile binning for high-cardinality numerics, and interaction terms between top-correlated features.</li>
            <li><strong>SMOTE</strong> — Synthetic Minority Oversampling. Generates synthetic samples for the minority class so the model doesn't just predict the majority class. Only applies to classification.</li>
          </ul>
        </HelpBanner>
      </div>

      {/* Training overlay */}
      {training && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
            <p className="text-lg font-semibold text-gray-800 mt-4">
              Training {modelDef?.label}...
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Please wait — this may take up to 3 minutes.
            </p>
            <p className="text-2xl font-mono font-bold text-purple-600 mt-3">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </p>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(95, elapsed * 1.5)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Latest result */}
      {result && (
        <div ref={resultsRef} className="space-y-6">
          {/* Metrics */}
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">
              Results — {result.model_name.replace(/_/g, " ")}
            </h2>

            {result.classification_metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                <MetricTile label="Accuracy" value={result.classification_metrics.accuracy} />
                <MetricTile label="Precision" value={result.classification_metrics.precision} />
                <MetricTile label="Recall" value={result.classification_metrics.recall} />
                <MetricTile label="F1 Score" value={result.classification_metrics.f1} />
                {result.classification_metrics.roc_auc != null && (
                  <MetricTile label="ROC AUC" value={result.classification_metrics.roc_auc} />
                )}
              </div>
            )}

            {result.regression_metrics && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <MetricTile label="MAE" value={result.regression_metrics.mae} />
                <MetricTile label="RMSE" value={result.regression_metrics.rmse} />
                <MetricTile label="R²" value={result.regression_metrics.r2} />
              </div>
            )}

            <p className="text-xs text-gray-500">
              Features used: {result.features_used?.length ?? 0}
              {result.smote_applied && <span className="ml-2 text-purple-600 font-medium">• SMOTE applied</span>}
              {result.feature_engineering_applied?.length > 0 && (
                <span className="ml-2 text-blue-600 font-medium">
                  • FE: {result.feature_engineering_applied.join(", ")}
                </span>
              )}
            </p>

            {/* Cross-validation results */}
            {(() => {
              const cv = result.classification_metrics?.cv || result.regression_metrics?.cv;
              if (!cv || cv.length === 0) return null;
              return (
                <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-indigo-700 mb-2">
                    Cross-Validation ({cv[0]?.folds?.length ?? "?"}-fold)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {cv.map((m: any) => (
                      <div key={m.metric_name} className="text-center">
                        <p className="text-lg font-bold text-indigo-600">{m.mean}</p>
                        <p className="text-[10px] text-gray-500">{m.metric_name.toUpperCase()} (±{m.std})</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">
                          folds: [{m.folds.join(", ")}]
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Interpretation */}
          <ResultsInterpretation result={result} />

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Confusion Matrix */}
            {result.confusion_matrix_data && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Confusion Matrix</h3>
                <Plot
                  data={[
                    {
                      z: result.confusion_matrix_data.z,
                      x: result.confusion_matrix_data.x,
                      y: result.confusion_matrix_data.y,
                      type: "heatmap" as const,
                      colorscale: "Blues",
                      showscale: true,
                      text: result.confusion_matrix_data.z.map((row: number[]) =>
                        row.map((v: number) => String(v))
                      ),
                      texttemplate: "%{text}",
                      hovertemplate: "Actual: %{y}<br>Predicted: %{x}<br>Count: %{z}<extra></extra>",
                    } as any,
                  ]}
                  layout={{
                    margin: { l: 80, r: 30, t: 20, b: 60 },
                    xaxis: { title: { text: "Predicted" }, tickfont: { size: 11 } },
                    yaxis: { title: { text: "Actual" }, tickfont: { size: 11 }, autorange: "reversed" },
                    height: 350,
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {/* ROC Curve */}
            {result.roc_curve_data && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">
                  ROC Curve (AUC = {result.roc_curve_data.auc})
                </h3>
                <Plot
                  data={[
                    {
                      x: result.roc_curve_data.fpr,
                      y: result.roc_curve_data.tpr,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: "ROC",
                      line: { color: "#7c3aed", width: 2 },
                    } as any,
                    {
                      x: [0, 1],
                      y: [0, 1],
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: "Random",
                      line: { color: "#d1d5db", dash: "dash", width: 1 },
                    } as any,
                  ]}
                  layout={{
                    margin: { l: 50, r: 30, t: 20, b: 50 },
                    xaxis: { title: { text: "False Positive Rate" } },
                    yaxis: { title: { text: "True Positive Rate" } },
                    height: 350,
                    showlegend: true,
                    legend: { x: 0.6, y: 0.1 },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {/* Predicted vs Actual */}
            {result.predicted_vs_actual && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Predicted vs Actual</h3>
                <Plot
                  data={[
                    {
                      x: result.predicted_vs_actual.y_true,
                      y: result.predicted_vs_actual.y_pred,
                      type: "scatter" as const,
                      mode: "markers" as const,
                      marker: { color: "#7c3aed", size: 5, opacity: 0.6 },
                      name: "Predictions",
                    } as any,
                    {
                      x: [
                        Math.min(...result.predicted_vs_actual.y_true),
                        Math.max(...result.predicted_vs_actual.y_true),
                      ],
                      y: [
                        Math.min(...result.predicted_vs_actual.y_true),
                        Math.max(...result.predicted_vs_actual.y_true),
                      ],
                      type: "scatter" as const,
                      mode: "lines" as const,
                      line: { color: "#d1d5db", dash: "dash" },
                      name: "Perfect",
                    } as any,
                  ]}
                  layout={{
                    margin: { l: 50, r: 30, t: 20, b: 50 },
                    xaxis: { title: { text: "Actual" } },
                    yaxis: { title: { text: "Predicted" } },
                    height: 350,
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {/* Residuals */}
            {result.residuals_data && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Residuals</h3>
                <Plot
                  data={[
                    {
                      x: result.residuals_data.y_pred,
                      y: result.residuals_data.residuals,
                      type: "scatter" as const,
                      mode: "markers" as const,
                      marker: { color: "#7c3aed", size: 5, opacity: 0.6 },
                    } as any,
                    {
                      x: [
                        Math.min(...result.residuals_data.y_pred),
                        Math.max(...result.residuals_data.y_pred),
                      ],
                      y: [0, 0],
                      type: "scatter" as const,
                      mode: "lines" as const,
                      line: { color: "#ef4444", dash: "dash" },
                    } as any,
                  ]}
                  layout={{
                    margin: { l: 50, r: 30, t: 20, b: 50 },
                    xaxis: { title: { text: "Predicted" } },
                    yaxis: { title: { text: "Residual" } },
                    height: 350,
                    showlegend: false,
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {/* Feature Importance */}
            {result.feature_importances && result.feature_importances.length > 0 && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Feature Importance (Top 15)</h3>
                <Plot
                  data={[
                    {
                      y: result.feature_importances
                        .slice(0, 15)
                        .reverse()
                        .map((f: any) => f.feature),
                      x: result.feature_importances
                        .slice(0, 15)
                        .reverse()
                        .map((f: any) => f.importance),
                      type: "bar" as const,
                      orientation: "h" as const,
                      marker: { color: "#7c3aed" },
                    } as any,
                  ]}
                  layout={{
                    margin: { l: 140, r: 30, t: 10, b: 40 },
                    xaxis: { title: { text: "Importance" } },
                    height: Math.max(250, Math.min(15, result.feature_importances.length) * 28 + 60),
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {/* Coefficients table */}
            {result.coefficients && result.coefficients.length > 0 && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Coefficients</h3>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 font-medium text-gray-600">Feature</th>
                        <th className="px-3 py-2 font-medium text-gray-600 text-right">Coefficient</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.coefficients
                        .sort((a: any, b: any) => Math.abs(b.coef) - Math.abs(a.coef))
                        .map((c: any) => (
                          <tr key={c.feature} className="border-t">
                            <td className="px-3 py-1.5 text-xs">{c.feature}</td>
                            <td
                              className={`px-3 py-1.5 text-xs text-right font-mono ${
                                c.coef > 0 ? "text-green-600" : c.coef < 0 ? "text-red-600" : ""
                              }`}
                            >
                              {c.coef > 0 ? "+" : ""}
                              {c.coef.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* All results comparison */}
          {allResults.length > 1 && (
            <div className="glass-card rounded-xl p-5 mt-6">
              <h2 className="text-lg font-semibold mb-3">Model Comparison</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600">
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      {allResults.some((r) => r.classification_metrics) && (
                        <>
                          <th className="px-3 py-2 font-medium text-right">Accuracy</th>
                          <th className="px-3 py-2 font-medium text-right">F1</th>
                          <th className="px-3 py-2 font-medium text-right">ROC AUC</th>
                        </>
                      )}
                      {allResults.some((r) => r.regression_metrics) && (
                        <>
                          <th className="px-3 py-2 font-medium text-right">R²</th>
                          <th className="px-3 py-2 font-medium text-right">RMSE</th>
                          <th className="px-3 py-2 font-medium text-right">MAE</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {allResults.map((r, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.model_name.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 capitalize text-gray-500">{r.problem_type}</td>
                        {r.classification_metrics && (
                          <>
                            <td className="px-3 py-2 text-right">{r.classification_metrics.accuracy}</td>
                            <td className="px-3 py-2 text-right">{r.classification_metrics.f1}</td>
                            <td className="px-3 py-2 text-right">{r.classification_metrics.roc_auc ?? "—"}</td>
                          </>
                        )}
                        {r.regression_metrics && (
                          <>
                            <td className="px-3 py-2 text-right">{r.regression_metrics.r2}</td>
                            <td className="px-3 py-2 text-right">{r.regression_metrics.rmse}</td>
                            <td className="px-3 py-2 text-right">{r.regression_metrics.mae}</td>
                          </>
                        )}
                        {!r.classification_metrics && allResults.some((x) => x.classification_metrics) && (
                          <><td /><td /><td /></>
                        )}
                        {!r.regression_metrics && allResults.some((x) => x.regression_metrics) && (
                          <><td /><td /><td /></>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Comparison interpretation */}
              <ComparisonInterpretation results={allResults} />
            </div>
          )}
        </div>
      )}

      {/* Continue to Report button — shown after at least one model is trained */}
      {allResults.length > 0 && (
        <div className="flex justify-center mt-8 mb-4">
          <button
            onClick={() => navigate(`/report/${runId}`)}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-semibold shadow-lg"
          >
            Continue to Summary Report
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-xl font-bold text-purple-600">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results interpreter — plain-English insights
// ---------------------------------------------------------------------------

function interpretClassification(m: any, modelName: string, topFeatures: string[]): string[] {
  const lines: string[] = [];
  const name = modelName.replace(/_/g, " ");

  // Overall verdict
  if (m.accuracy >= 0.9) {
    lines.push(`The ${name} model achieved excellent accuracy (${(m.accuracy * 100).toFixed(1)}%), indicating strong predictive power on this dataset.`);
  } else if (m.accuracy >= 0.75) {
    lines.push(`The ${name} model achieved good accuracy (${(m.accuracy * 100).toFixed(1)}%). The model captures most of the patterns in the data.`);
  } else if (m.accuracy >= 0.6) {
    lines.push(`The ${name} model achieved moderate accuracy (${(m.accuracy * 100).toFixed(1)}%). There may be room for improvement through feature engineering or trying different models.`);
  } else {
    lines.push(`The ${name} model achieved low accuracy (${(m.accuracy * 100).toFixed(1)}%). The model struggles to distinguish between classes — consider more features, different preprocessing, or a different model.`);
  }

  // Precision vs Recall trade-off
  const precRecDiff = Math.abs(m.precision - m.recall);
  if (precRecDiff > 0.15) {
    if (m.precision > m.recall) {
      lines.push(`Precision (${(m.precision * 100).toFixed(1)}%) is notably higher than recall (${(m.recall * 100).toFixed(1)}%). The model is conservative — when it predicts a class, it's usually right, but it misses some true positives.`);
    } else {
      lines.push(`Recall (${(m.recall * 100).toFixed(1)}%) is notably higher than precision (${(m.precision * 100).toFixed(1)}%). The model catches most positives but has more false alarms.`);
    }
  } else {
    lines.push(`Precision (${(m.precision * 100).toFixed(1)}%) and recall (${(m.recall * 100).toFixed(1)}%) are well-balanced, reflected in an F1 score of ${(m.f1 * 100).toFixed(1)}%.`);
  }

  // ROC AUC
  if (m.roc_auc != null) {
    if (m.roc_auc >= 0.9) {
      lines.push(`ROC AUC of ${m.roc_auc.toFixed(3)} indicates excellent discriminative ability — the model reliably separates the classes.`);
    } else if (m.roc_auc >= 0.7) {
      lines.push(`ROC AUC of ${m.roc_auc.toFixed(3)} shows good class separation ability.`);
    } else {
      lines.push(`ROC AUC of ${m.roc_auc.toFixed(3)} suggests limited class separation — close to random guessing (0.5).`);
    }
  }

  // Top features
  if (topFeatures.length > 0) {
    lines.push(`The most influential features are: ${topFeatures.slice(0, 5).join(", ")}. These drive the model's predictions the most.`);
  }

  return lines;
}

function interpretRegression(m: any, modelName: string, topFeatures: string[]): string[] {
  const lines: string[] = [];
  const name = modelName.replace(/_/g, " ");

  // R²
  if (m.r2 >= 0.9) {
    lines.push(`The ${name} model explains ${(m.r2 * 100).toFixed(1)}% of the variance in the target — an excellent fit.`);
  } else if (m.r2 >= 0.7) {
    lines.push(`The ${name} model explains ${(m.r2 * 100).toFixed(1)}% of the variance — a good fit, though some variance remains unexplained.`);
  } else if (m.r2 >= 0.4) {
    lines.push(`The ${name} model explains ${(m.r2 * 100).toFixed(1)}% of the variance — a moderate fit. Consider adding more features or trying non-linear models.`);
  } else if (m.r2 >= 0) {
    lines.push(`The ${name} model explains only ${(m.r2 * 100).toFixed(1)}% of the variance — a weak fit. The target may require different features or a more complex model.`);
  } else {
    lines.push(`The ${name} model has a negative R² (${m.r2.toFixed(4)}), meaning it performs worse than simply predicting the mean. The model is not appropriate for this data.`);
  }

  // MAE / RMSE
  lines.push(`On average, predictions are off by ${m.mae.toFixed(4)} (MAE). The RMSE of ${m.rmse.toFixed(4)} penalizes larger errors more heavily.`);

  if (m.rmse > m.mae * 1.5) {
    lines.push("The gap between RMSE and MAE suggests some predictions have large errors (outlier predictions). Check the residuals plot for patterns.");
  }

  // Top features
  if (topFeatures.length > 0) {
    lines.push(`The most influential features are: ${topFeatures.slice(0, 5).join(", ")}.`);
  }

  return lines;
}

function generateRecommendations(result: any): string[] {
  const recs: string[] = [];
  const name = result.model_name;
  const cls = result.classification_metrics;
  const reg = result.regression_metrics;

  if (cls) {
    if (cls.accuracy < 0.7) {
      recs.push("Try ensemble models (Random Forest, Gradient Boosting) which often improve accuracy on complex datasets.");
    }
    if (cls.precision < 0.7 && cls.recall > 0.7) {
      recs.push("To reduce false positives, consider raising the classification threshold or using a model with better precision.");
    }
    if (cls.recall < 0.7 && cls.precision > 0.7) {
      recs.push("To catch more true positives, consider lowering the threshold or using class weighting (set to 'balanced').");
    }
    if (name === "logistic_regression" || name === "naive_bayes") {
      recs.push("Linear models may underperform if relationships are non-linear. Try Decision Tree or Random Forest for comparison.");
    }
  }

  if (reg) {
    if (reg.r2 < 0.5) {
      recs.push("Low R² may indicate missing important features. Consider feature engineering or collecting additional variables.");
    }
    if (name === "linear_regression") {
      recs.push("If the relationship is non-linear, try Polynomial Regression or tree-based models (Random Forest, Gradient Boosting).");
    }
  }

  if (result.features_used && result.features_used.length > 30) {
    recs.push("Many features detected. Try feature selection (Forward, Backward, or Lasso) to reduce dimensionality and potentially improve performance.");
  }

  if (recs.length === 0) {
    recs.push("Results look solid. Consider training additional models to compare performance and validate findings.");
  }

  return recs;
}

function ResultsInterpretation({ result }: { result: any }) {
  const topFeatures = (result.feature_importances || [])
    .slice(0, 5)
    .map((f: any) => f.feature);

  const insights = result.classification_metrics
    ? interpretClassification(result.classification_metrics, result.model_name, topFeatures)
    : result.regression_metrics
    ? interpretRegression(result.regression_metrics, result.model_name, topFeatures)
    : [];

  const recommendations = generateRecommendations(result);

  if (insights.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-5">
      <h3 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Interpretation
      </h3>

      <div className="space-y-2 mb-4">
        {insights.map((line, i) => (
          <p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>
        ))}
      </div>

      {recommendations.length > 0 && (
        <div className="border-t border-purple-200 pt-3 mt-3">
          <p className="text-xs font-semibold text-purple-700 mb-2">Recommendations</p>
          <ul className="space-y-1">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-purple-500 mt-0.5 shrink-0">&#8226;</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ComparisonInterpretation({ results }: { results: any[] }) {
  if (results.length < 2) return null;

  const lines: string[] = [];

  const clsResults = results.filter((r) => r.classification_metrics);
  if (clsResults.length >= 2) {
    const best = clsResults.reduce((a, b) =>
      a.classification_metrics.f1 > b.classification_metrics.f1 ? a : b
    );
    const worst = clsResults.reduce((a, b) =>
      a.classification_metrics.f1 < b.classification_metrics.f1 ? a : b
    );
    const bestName = best.model_name.replace(/_/g, " ");
    const worstName = worst.model_name.replace(/_/g, " ");

    lines.push(
      `Best performing model: **${bestName}** with F1 = ${best.classification_metrics.f1} and accuracy = ${(best.classification_metrics.accuracy * 100).toFixed(1)}%.`
    );

    if (best.model_name !== worst.model_name) {
      const f1Diff = (best.classification_metrics.f1 - worst.classification_metrics.f1).toFixed(3);
      lines.push(
        `Weakest: ${worstName} (F1 = ${worst.classification_metrics.f1}). The gap of ${f1Diff} suggests ${
          parseFloat(f1Diff) > 0.1
            ? "a meaningful difference — model choice matters for this dataset."
            : "models perform similarly — the dataset may be straightforward."
        }`
      );
    }

    const ensembles = clsResults.filter((r) =>
      ["random_forest_classifier", "gradient_boosting_classifier"].includes(r.model_name)
    );
    const simples = clsResults.filter((r) =>
      ["logistic_regression", "naive_bayes"].includes(r.model_name)
    );
    if (ensembles.length > 0 && simples.length > 0) {
      const bestEns = Math.max(...ensembles.map((r: any) => r.classification_metrics.f1));
      const bestSimple = Math.max(...simples.map((r: any) => r.classification_metrics.f1));
      if (bestEns > bestSimple + 0.05) {
        lines.push("Ensemble models outperform simpler models here, suggesting non-linear patterns in the data.");
      } else if (bestSimple >= bestEns) {
        lines.push("Simpler models perform comparably to ensembles — a good sign for interpretability. You may prefer the simpler model.");
      }
    }
  }

  const regResults = results.filter((r) => r.regression_metrics);
  if (regResults.length >= 2) {
    const best = regResults.reduce((a, b) =>
      a.regression_metrics.r2 > b.regression_metrics.r2 ? a : b
    );
    const worst = regResults.reduce((a, b) =>
      a.regression_metrics.r2 < b.regression_metrics.r2 ? a : b
    );
    const bestName = best.model_name.replace(/_/g, " ");
    const worstName = worst.model_name.replace(/_/g, " ");

    lines.push(
      `Best performing model: **${bestName}** with R\u00B2 = ${best.regression_metrics.r2} and RMSE = ${best.regression_metrics.rmse}.`
    );

    if (best.model_name !== worst.model_name) {
      lines.push(
        `Weakest: ${worstName} (R\u00B2 = ${worst.regression_metrics.r2}).`
      );
    }

    if (best.regression_metrics.r2 < 0.5) {
      lines.push("Note: Even the best model explains less than 50% of variance. Consider adding more features or engineering new ones.");
    }
  }

  if (lines.length === 0) return null;

  return (
    <div className="mt-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-4">
      <p className="text-xs font-semibold text-purple-800 mb-2">Comparison Insights</p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-xs text-gray-700 leading-relaxed">
            {line.split("**").map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="text-purple-700">{part}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        ))}
      </div>
    </div>
  );
}
