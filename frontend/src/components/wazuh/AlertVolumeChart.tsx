import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { AlertBucket } from "../../api/client";
import { format, parseISO } from "date-fns";

interface Props {
  data: AlertBucket[] | null;
  error: string | null;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
}

const SEV_COLORS = {
  critical: "#ff2d6d",
  high:     "#ff6b35",
  medium:   "#fbbf24",
  low:      "#34d399",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  let formatted = label;
  try {
    formatted = format(parseISO(label), "MMM d HH:mm");
  } catch {}
  return (
    <div className="bg-surface-700 border border-surface-600 rounded-xl p-3 shadow-2xl text-xs" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(124,58,237,0.18)" }}>
      <p className="text-slate-300 mb-2 font-medium">{formatted}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-slate-400 capitalize">{p.dataKey}:</span>
          <span className="text-slate-100 font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

function formatXTick(value: string, timeframe: string) {
  try {
    const d = parseISO(value);
    if (timeframe === "24h") return format(d, "HH:mm");
    if (timeframe === "7d") return format(d, "EEE HH:mm");
    return format(d, "MMM d");
  } catch {
    return value;
  }
}

export default function AlertVolumeChart({ data, error, timeframe, onTimeframeChange }: Props) {
  const isDark  = document.documentElement.classList.contains("dark");
  const gridClr = isDark ? "#2d2b55" : "#e2e8f0";
  const tickClr = isDark ? "#6e6c9e" : "#64748b";
  const legClr  = isDark ? "#9896c8" : "#64748b";

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Alert Volume</h3>
        <div className="flex gap-1">
          {["24h", "7d", "30d"].map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                timeframe === tf
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="h-52 flex items-center justify-center text-red-400 text-sm">{error}</div>
      ) : !data ? (
        <div className="h-52 flex flex-col gap-3 justify-end pb-4">
          {[60, 80, 40, 90, 50, 70, 30].map((h, i) => (
            <div key={i} className="skeleton rounded" style={{ height: h, width: "100%" }} />
          ))}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridClr} vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => formatXTick(v, timeframe)}
              tick={{ fill: tickClr, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: tickClr, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: legClr, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: legClr, textTransform: "capitalize" }}>{v}</span>}
            />
            <Bar dataKey="critical" stackId="a" fill={SEV_COLORS.critical} radius={[0, 0, 0, 0]} maxBarSize={40} />
            <Bar dataKey="high" stackId="a" fill={SEV_COLORS.high} maxBarSize={40} />
            <Bar dataKey="medium" stackId="a" fill={SEV_COLORS.medium} maxBarSize={40} />
            <Bar dataKey="low" stackId="a" fill={SEV_COLORS.low} radius={[2, 2, 0, 0]} maxBarSize={40} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
