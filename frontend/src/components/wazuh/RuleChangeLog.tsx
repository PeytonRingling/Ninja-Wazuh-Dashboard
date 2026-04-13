import { useState, useEffect, useMemo } from "react";
import { api, SuppressionLogEntry } from "../../api/client";

type SortKey = "created_at" | "rule_id" | "alert_count";

function downloadCSV() {
  window.open("/api/changelog/export", "_blank");
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function RuleChangeLog() {
  const [entries, setEntries] = useState<SuppressionLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    api.changelog()
      .then(setEntries)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load log"));
  }, []);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    if (!entries) return null;
    return [...entries].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortKey, sortDir]);

  // Running total per day
  const dailyTotals = useMemo(() => {
    if (!entries?.length) return [];
    const map = new Map<string, number>();
    for (const e of entries) {
      const day = e.created_at.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + e.alert_count);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  }, [entries]);

  const totalSuppressed = entries?.reduce((s, e) => s + e.alert_count, 0) ?? 0;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className={`ml-1 ${sortKey === k ? "text-accent" : "text-slate-600"}`}>
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rules Suppressed</p>
          <p className="text-3xl font-bold text-accent tabular-nums">{entries?.length ?? "—"}</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Alerts Suppressed</p>
          <p className="text-3xl font-bold text-[#34d399] tabular-nums">{totalSuppressed.toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Alerts Suppressed / Day (last 7d)</p>
          {dailyTotals.length > 0 ? (
            <div className="space-y-1">
              {dailyTotals.map(([day, count]) => {
                const maxCount = Math.max(...dailyTotals.map(d => d[1]), 1);
                return (
                  <div key={day} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-20 shrink-0">{day.slice(5)}</span>
                    <div className="flex-1 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent/60" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums w-10 text-right">{count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No data yet</p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Suppression History</h3>
            <p className="text-xs text-slate-500 mt-0.5">Logged each time suppression XML is copied</p>
          </div>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white border border-surface-600 hover:border-surface-500 bg-surface-700 hover:bg-surface-600 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {error ? (
          <div className="text-red-400 text-sm text-center py-8">{error}</div>
        ) : !sorted ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg className="w-10 h-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <p className="text-slate-500 text-sm">No suppression rules logged yet</p>
            <p className="text-slate-600 text-xs">Copy a suppression XML snippet from the Top Rules tab to log it here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-600">
                  {([
                    ["created_at", "Date / Time"],
                    ["rule_id",    "Rule ID"],
                    ["description","Description"],
                    ["alert_count","Alert Count"],
                  ] as [SortKey | "description", string][]).map(([k, label]) => (
                    <th key={k}
                      onClick={() => k !== "description" && handleSort(k as SortKey)}
                      className={`text-left py-2.5 px-3 text-xs font-semibold text-slate-400 whitespace-nowrap ${k !== "description" ? "cursor-pointer hover:text-slate-200" : ""}`}
                    >
                      {label}{k !== "description" && <SortIcon k={k as SortKey} />}
                    </th>
                  ))}
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400">Est. Reduction</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(e => (
                  <tr key={e.id} className="border-b border-surface-700/50 hover:bg-surface-700/30 transition-colors">
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap font-mono">{fmtDate(e.created_at)}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-accent">{e.rule_id}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-300 max-w-xs">
                      <span className="truncate block" title={e.description}>{e.description}</span>
                    </td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-slate-200 tabular-nums">{e.alert_count.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-xs">
                      {e.reduction_pct != null ? (
                        <span className="text-[#34d399] font-semibold">{e.reduction_pct.toFixed(1)}%</span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-400 max-w-xs">
                      <span className="truncate block italic" title={e.notes ?? ""}>{e.notes || <span className="text-slate-600 not-italic">—</span>}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
