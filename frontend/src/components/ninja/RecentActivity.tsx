import { useState } from "react";
import { NinjaActivity, NinjaDevice } from "../../api/client";
import { format } from "date-fns";

interface Props {
  data: NinjaActivity[] | null;
  error: string | null;
  devices: NinjaDevice[];
  deviceFilter: string;
  onDeviceFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
}

type Severity = "critical" | "high" | "medium" | "low" | "none";

function normalizeSeverity(raw?: string): Severity {
  switch (raw?.toUpperCase()) {
    case "CRITICAL":              return "critical";
    case "HIGH":                  return "high";
    case "MEDIUM": case "MODERATE": return "medium";
    case "LOW":    case "MINOR":    return "low";
    default:                      return "none";
  }
}

const SEV_BADGE: Record<Severity, string> = {
  critical: "bg-red-500/15 border-red-500/40 text-red-400",
  high:     "bg-orange-500/15 border-orange-500/40 text-orange-400",
  medium:   "bg-yellow-500/15 border-yellow-500/40 text-yellow-400",
  low:      "bg-green-500/15 border-green-500/40 text-green-400",
  none:     "bg-surface-600 border-surface-500 text-slate-500",
};
const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info",
};
const SEV_COLOR: Record<Severity, string> = {
  critical: "#ff2d6d", high: "#ff6b35", medium: "#fbbf24", low: "#34d399", none: "#5b5a8a",
};
const SEV_BTN_ACTIVE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low:      "bg-green-500/20 text-green-400 border-green-500/30",
};
const FILTER_SEVS = ["critical", "high", "medium", "low"] as const;

type EnrichedActivity = NinjaActivity & { _sev: Severity; _deviceName: string };

function ActivityItem({ a }: { a: EnrichedActivity }) {
  const ts = a.createTime
    ? format(new Date(a.createTime > 1e12 ? a.createTime : a.createTime * 1000), "MMM d, HH:mm")
    : "—";
  const device = a._deviceName;

  return (
    <div className="flex gap-3 py-3 border-b border-surface-700/50 last:border-0 hover:bg-surface-700/30 px-3 -mx-3 rounded-lg transition-colors">
      <div className="shrink-0 pt-0.5">
        <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium border w-16 ${SEV_BADGE[a._sev]}`}>
          {SEV_LABEL[a._sev]}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm text-slate-200 leading-snug">{a.message ?? "Activity recorded"}</span>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-accent font-medium">{device}</span>
              {a.activityType && (
                <span className="text-xs text-slate-500 bg-surface-700 px-1.5 py-0.5 rounded">
                  {a.activityType.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">{ts}</span>
        </div>
      </div>
    </div>
  );
}

export default function RecentActivity({
  data, error, devices, deviceFilter, onDeviceFilterChange, typeFilter, onTypeFilterChange,
}: Props) {
  const [sevFilter, setSevFilter] = useState<string>("");

  const deviceNameMap = new Map<number, string>(
    devices.map((d) => [d.id, d.displayName ?? d.systemName ?? `Device ${d.id}`])
  );

  const enriched: EnrichedActivity[] | null = data
    ? data.map((a) => ({
        ...a,
        _sev: normalizeSeverity(a.severity),
        _deviceName: a.device?.systemName
          ?? (a.deviceId != null ? deviceNameMap.get(a.deviceId) : undefined)
          ?? (a.deviceId != null ? `Device ${a.deviceId}` : "System"),
      }))
    : null;

  const sevCounts = enriched
    ? FILTER_SEVS.reduce((acc, s) => ({ ...acc, [s]: enriched.filter((a) => a._sev === s).length }), {} as Record<string, number>)
    : null;

  const activityTypes = enriched
    ? [...new Set(enriched.map((a) => a.activityType).filter(Boolean))]
    : [];

  const filtered = enriched?.filter((a) => {
    if (sevFilter && a._sev !== sevFilter) return false;
    if (deviceFilter) {
      const q = deviceFilter.toLowerCase();
      if (!a._deviceName.toLowerCase().includes(q) && String(a.deviceId) !== deviceFilter) return false;
    }
    if (typeFilter && a.activityType !== typeFilter) return false;
    return true;
  }) ?? null;

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Recent Activity
          {data && <span className="ml-2 text-xs text-slate-500">{data.length} events</span>}
        </h3>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Severity filter pills */}
          {sevCounts && FILTER_SEVS.map((sev) => {
            const count = sevCounts[sev];
            if (!count) return null;
            const active = sevFilter === sev;
            return (
              <button
                key={sev}
                onClick={() => setSevFilter(active ? "" : sev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active ? SEV_BTN_ACTIVE[sev] : "text-slate-500 border-surface-600 hover:text-slate-300 hover:border-surface-500"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[sev] }} />
                {SEV_LABEL[sev]}
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}

          <input
            type="text"
            placeholder="Filter device..."
            value={deviceFilter}
            onChange={(e) => onDeviceFilterChange(e.target.value)}
            className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-accent w-32"
          />
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent"
          >
            <option value="">All types</option>
            {activityTypes.map((t) => (
              <option key={t} value={t!}>{t!.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="text-red-400 text-sm text-center py-4">{error}</div>
      ) : !filtered ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">No activity matches current filters</div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {filtered.map((a) => <ActivityItem key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}
