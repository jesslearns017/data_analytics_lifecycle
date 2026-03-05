import { useState } from "react";

type Props = {
  columns: string[];
  rows: Record<string, unknown>[];
  initialRows?: number;
};

export default function DatasetPreviewTable({ columns, rows, initialRows = 10 }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, initialRows);

  return (
    <div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left font-medium text-gray-600 border-b whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-1.5 border-b border-gray-100 whitespace-nowrap text-gray-700"
                  >
                    {row[col] === null || row[col] === undefined ? (
                      <span className="text-gray-300 italic">null</span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > initialRows && (
        <div className="py-2 text-center border-t bg-gray-50">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            {showAll
              ? "Show less"
              : `Show all ${rows.length} rows (${rows.length - initialRows} more)`}
          </button>
        </div>
      )}
    </div>
  );
}
