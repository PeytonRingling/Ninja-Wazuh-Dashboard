import { Summary } from "../api/client";

interface Props {
  summary: Summary | null;
  summaryError: string | null;
  onSeverityClick?: (severity: string) => void;
}

function SevBadge({
  label, count, color, onClick,
}: {
  label: string; count: number; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-opacity ${color} ${
        onClick ? "cursor-pointer hover:opacity-80 active:scale-95" : "cursor-default"
      }`}
    >
      <span className="text-xs opacity-70">{label}</span>
      <span className="font-bold tabular-nums">{count.toLocaleString()}</span>
    </button>
  );
}

function Dot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        online ? "bg-green-400 shadow-[0_0_6px_#4ade80]" : "bg-slate-600"
      }`}
    />
  );
}

export default function TopBar({ summary, summaryError, onSeverityClick }: Props) {
  const w = summary?.wazuh;
  const n = summary?.ninja;

  return (
    <header className="bg-surface-800 border-b border-surface-600 sticky top-0 z-20 shadow-xl">
      <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center gap-6">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-100 hidden sm:block">OPS Dashboard</span>
        </div>

        <div className="h-5 w-px bg-surface-600" />

        {/* Wazuh Severity Summary */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 uppercase tracking-wider shrink-0">Alerts</span>
          {w ? (
            <>
              <SevBadge label="Crit" count={w.critical} color="badge-critical" onClick={() => onSeverityClick?.("critical")} />
              <SevBadge label="High" count={w.high} color="badge-high" onClick={() => onSeverityClick?.("high")} />
              <SevBadge label="Med" count={w.medium} color="badge-medium" onClick={() => onSeverityClick?.("medium")} />
              <SevBadge label="Low" count={w.low} color="badge-low" onClick={() => onSeverityClick?.("low")} />
            </>
          ) : summary?.wazuh_error ? (
            <span className="text-xs text-red-400">Wazuh offline</span>
          ) : (
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-7 w-16 rounded-lg" />
              ))}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-surface-600 hidden md:block" />

        {/* NinjaOne Device Status */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Devices</span>
          {n ? (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <Dot online={true} />
                <span className="font-semibold text-green-400">{n.online}</span>
                <span className="text-slate-500 text-xs">online</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot online={false} />
                <span className="font-semibold text-slate-400">{n.offline}</span>
                <span className="text-slate-500 text-xs">offline</span>
              </div>
            </div>
          ) : summary?.ninja_error ? (
            <span className="text-xs text-red-400">NinjaOne offline</span>
          ) : (
            <div className="skeleton h-5 w-32 rounded" />
          )}
        </div>

        {/* Critical alert banner */}
        {w && w.critical > 0 && (
          <button
            onClick={() => onSeverityClick?.("critical")}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium animate-pulse hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            {w.critical} critical alert{w.critical !== 1 ? "s" : ""} require attention
          </button>
        )}

        {summaryError && (
          <div className="ml-auto text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
            {summaryError}
          </div>
        )}
      </div>
    </header>
  );
}
