import { useState } from "react";
import { NoisyRule } from "../../api/client";
import SevBadge from "../SevBadge";

interface Props {
  data: NoisyRule[] | null;
  error: string | null;
  hoursBack: number;
}

type SortKey = "alert_count" | "level" | "rule_id";

const SEV_ORDER = ["critical", "high", "medium", "low"] as const;
const SEV_LABELS: Record<string, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};
const SEV_BTN: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
};
const SEV_BTN_INACTIVE = "text-slate-500 border-surface-600 hover:text-slate-300 hover:border-surface-500";

export default function NoisyRules({ data, error, hoursBack }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("alert_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sevFilter, setSevFilter] = useState<string>("");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Counts per severity for the filter pills
  const sevCounts = data
    ? SEV_ORDER.reduce((acc, s) => {
        acc[s] = data.filter((r) => r.severity === s).length;
        return acc;
      }, {} as Record<string, number>)
    : null;

  // When no severity filter, show overall top 20 by count.
  // When filtered, show top 20 of that severity by count.
  const sorted = data
    ? [...data]
        .filter((r) => !sevFilter || r.severity === sevFilter)
        .sort((a, b) => {
          const av = a[sortKey] ?? 0;
          const bv = b[sortKey] ?? 0;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortDir === "asc" ? cmp : -cmp;
        })
        .slice(0, 20)
    : null;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className={`ml-1 ${sortKey === k ? "text-accent" : "text-slate-600"}`}>
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const maxCount = sorted?.reduce((m, r) => Math.max(m, r.alert_count), 1) ?? 1;

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Top Noisy Rules</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Last {hoursBack}h · {sevFilter ? `top 20 ${sevFilter}` : "top 20 overall"} by alert count
          </p>
        </div>

        {/* Severity filter pills */}
        {sevCounts && (
          <div className="flex flex-wrap gap-1.5">
            {/* All */}
            <button
              onClick={() => setSevFilter("")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                sevFilter === ""
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "text-slate-500 border-surface-600 hover:text-slate-300 hover:border-surface-500"
              }`}
            >
              All
            </button>

            {/* Critical always visible; others hidden when count = 0 */}
            {SEV_ORDER.map((sev) => {
              const active = sevFilter === sev;
              const count = sevCounts[sev];
              if (sev !== "critical" && count === 0) return null;
              return (
                <button
                  key={sev}
                  onClick={() => setSevFilter(active ? "" : sev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    active ? SEV_BTN[sev] : SEV_BTN_INACTIVE
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: sev === "critical" ? "#ef4444" : sev === "high" ? "#f97316" : sev === "medium" ? "#eab308" : "#22c55e",
                    }}
                  />
                  {SEV_LABELS[sev]}
                  <span className={`${active ? "opacity-80" : "opacity-50"}`}>({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error ? (
        <div className="text-red-400 text-sm py-4 text-center">{error}</div>
      ) : !sorted ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">
          {sevFilter ? `No ${sevFilter} rules in last ${hoursBack}h` : "No rules found"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-600">
                {([
                  ["rule_id", "Rule ID"],
                  ["description", "Description"],
                  ["level", "Severity"],
                  ["alert_count", "Alert Count"],
                ] as [SortKey | "description", string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => key !== "description" && handleSort(key as SortKey)}
                    className={`text-left py-2 px-3 text-xs font-medium text-slate-400 whitespace-nowrap ${
                      key !== "description" ? "cursor-pointer hover:text-slate-200" : ""
                    }`}
                  >
                    {label}
                    {key !== "description" && <SortIcon k={key as SortKey} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((rule) => {
                const pct = Math.round((rule.alert_count / maxCount) * 100);
                const barColor =
                  rule.severity === "critical" ? "#ef4444"
                  : rule.severity === "high" ? "#f97316"
                  : rule.severity === "medium" ? "#eab308"
                  : "#22c55e";
                return (
                  <tr
                    key={rule.rule_id}
                    className="border-b border-surface-700 hover:bg-surface-700/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono text-xs text-accent">{rule.rule_id}</td>
                    <td className="py-2.5 px-3 text-slate-300 max-w-xs">
                      <span className="truncate block" title={rule.description}>
                        {rule.description}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <SevBadge severity={rule.severity} label={`${rule.level} · ${SEV_LABELS[rule.severity] ?? rule.severity}`} />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-600 rounded-full overflow-hidden min-w-[60px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: barColor }}
                          />
                        </div>
                        <span className="font-semibold text-slate-200 tabular-nums min-w-[48px] text-right text-xs">
                          {rule.alert_count.toLocaleString()}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
