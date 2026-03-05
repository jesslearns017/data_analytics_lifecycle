import { useNavigate } from "react-router-dom";

type Step = {
  number: number;
  label: string;
  description: string;
  path?: string;
};

const STEPS: Step[] = [
  {
    number: 1,
    label: "Define Goal",
    description: "Identify the business problem",
    path: "/upload",
  },
  {
    number: 2,
    label: "Get Data",
    description: "Collect and explore the data",
    path: "/profile",
  },
  {
    number: 3,
    label: "Clean Data",
    description: "Handle missing values, duplicates, outliers",
    path: "/etl",
  },
  {
    number: 4,
    label: "Enrich Data",
    description: "Transform, encode, and scale features",
    path: "/etl",
  },
  {
    number: 5,
    label: "Analyze",
    description: "Find insights and visualize",
    path: "/model",
  },
  {
    number: 6,
    label: "Deploy",
    description: "Deploy DA insights",
    path: "/report",
  },
];

type Props = {
  currentStep: number;
  runId?: string;
};

export default function LifecycleStepper({ currentStep, runId }: Props) {
  const navigate = useNavigate();

  const handleClick = (step: Step) => {
    if (!step.path || !runId) return;
    if (step.number === 1) {
      navigate("/upload");
    } else {
      navigate(`${step.path}/${runId}`);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-center text-lg font-bold text-gray-700 mb-0.5">Data Analytics Lifecycle</h2>
      <p className="text-center text-[10px] text-gray-400 mb-4">Brought to you by Jessie M. Flores</p>
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {STEPS.map((step, idx) => {
          const isActive = step.number === currentStep;
          const isDone = step.number < currentStep;
          const isFuture = step.number > currentStep;

          return (
            <div key={step.number} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <button
                onClick={() => (isDone || isActive) && handleClick(step)}
                className={`flex flex-col items-center group ${
                  isDone || isActive ? "cursor-pointer" : "cursor-default"
                }`}
                title={step.description}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isActive
                      ? "bg-blue-600 text-white ring-4 ring-blue-200"
                      : isDone
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isDone ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`text-[10px] mt-1 font-medium text-center leading-tight max-w-[80px] ${
                    isActive
                      ? "text-blue-700"
                      : isDone
                      ? "text-green-700"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {idx < STEPS.length - 1 && (
                <div className="flex-1 mx-2 mt-[-18px]">
                  <div
                    className={`h-0.5 w-full ${
                      step.number < currentStep ? "bg-green-400" : "bg-gray-200"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
