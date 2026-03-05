import { GraduationCap } from "lucide-react";

type Props = {
  stepNumber: number;
  title: string;
  children: React.ReactNode;
};

export default function LearnBanner({ stepNumber, title, children }: Props) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-5 mb-6">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
          <GraduationCap size={20} className="text-indigo-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-0.5">
            Step {stepNumber} of the Data Analytics Lifecycle
          </p>
          <h3 className="text-sm font-semibold text-indigo-900 mb-2">{title}</h3>
          <div className="text-sm text-gray-700 leading-relaxed space-y-1.5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
