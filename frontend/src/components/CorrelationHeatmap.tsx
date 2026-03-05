import Plot from "react-plotly.js";
import type { CorrelationMatrix } from "../types";

type Props = {
  correlation: CorrelationMatrix;
};

export default function CorrelationHeatmap({ correlation }: Props) {
  return (
    <Plot
      data={[
        {
          z: correlation.matrix,
          x: correlation.columns,
          y: correlation.columns,
          type: "heatmap" as const,
          colorscale: "RdBu",
          zmid: 0,
          zmin: -1,
          zmax: 1,
          text: correlation.matrix.map((row) =>
            row.map((v) => v.toFixed(2))
          ),
          hovertemplate:
            "%{y} vs %{x}<br>Correlation: %{text}<extra></extra>",
          showscale: true,
          colorbar: {
            title: { text: "r", side: "right" as const },
            thickness: 15,
          },
        } as unknown as Plotly.Data,
      ]}
      layout={{
        margin: { l: 100, r: 30, t: 20, b: 100 },
        xaxis: {
          tickangle: -45,
          tickfont: { size: 11 },
        },
        yaxis: {
          tickfont: { size: 11 },
          autorange: "reversed",
        },
        height: Math.max(350, correlation.columns.length * 40 + 120),
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
      }}
      config={{ displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}
