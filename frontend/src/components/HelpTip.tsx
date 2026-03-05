import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

type Props = {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export default function HelpTip({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
        title={`Learn about ${title}`}
      >
        <HelpCircle size={14} />
        <span className="underline decoration-dotted">{title}</span>
      </button>
      {open && (
        <div className="absolute z-40 left-0 top-full mt-1 w-80 bg-white border border-blue-200 rounded-xl shadow-lg p-4 text-sm text-gray-700 leading-relaxed">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-semibold text-blue-800 text-xs uppercase tracking-wide">
              {title}
            </h4>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2 text-xs">{children}</div>
        </div>
      )}
    </div>
  );
}

export function HelpBanner({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-blue-100 transition-colors"
      >
        <HelpCircle size={16} className="text-blue-500 shrink-0" />
        <span className="text-sm font-medium text-blue-700 flex-1">{title}</span>
        <span className="text-xs text-blue-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs text-gray-700 leading-relaxed space-y-2 border-t border-blue-100 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
