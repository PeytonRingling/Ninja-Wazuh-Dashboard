import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { AlertBucket } from "../../api/client";

interface Props {
  data: AlertBucket[] | null;
  selectedSeverity: string;
  onSeveritySelect: (sev: string) => void;
}

const SEV_COLORS: Record<string, string> = {
  critical: "#ff2d6d",
  high: "#ff6b35",
  medium: "#fbbf24",
  low: "#34d399",
};

export default function SeverityDonut({ data, selectedSeverity, onSeveritySelect }: Props) {
  const totals = data
    ? data.reduce(
        (acc, b) => {
          acc.critical += b.critical;
          acc.high += b.high;
          acc.medium += b.medium;
          acc.low += b.low;
          return acc;
        },
        { critical: 0, high: 0, medium: 0, low: 0 }
      )
    : null;

  const pieData = totals
    ? Object.entries(totals)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value }))
    : [];

  const total = totals ? Object.values(totals).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="card h-full flex flex-col">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Severity Distribution</h3>

      {!data ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="skeleton w-36 h-36 rounded-full" />
        </div>
      ) : pieData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">No alerts</div>
      ) : (
        <>
          <div className="relative flex-1">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(entry) => onSeveritySelect(entry.name)}
                  cursor="pointer"
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SEV_COLORS[entry.name] ?? "#64748b"}
                      opacity={selectedSeverity && selectedSeverity !== entry.name ? 0.3 : 1}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0f1629",
                    border: "1px solid #1a2540",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [
                    `${v.toLocaleString()} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
                    <span style={{ textTransform: "capitalize" }}>{name}</span>,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-100">{total.toLocaleString()}</span>
              <span className="text-xs text-slate-500">total</span>
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {pieData.map((entry) => (
              <button
                key={entry.name}
                onClick={() => onSeveritySelect(entry.name)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                  selectedSeverity === entry.name
                    ? "bg-surface-600"
                    : "hover:bg-surface-700"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: SEV_COLORS[entry.name] }}
                />
                <span className="capitalize text-slate-400">{entry.name}</span>
                <span className="ml-auto font-semibold text-slate-200">{entry.value.toLocaleString()}</span>
              </button>
            ))}
          </div>

          {selectedSeverity && (
            <button
              onClick={() => onSeveritySelect("")}
              className="mt-2 text-xs text-accent hover:text-accent-hover text-center w-full"
            >
              Clear filter
            </button>
          )}
        </>
      )}
    </div>
  );
}
