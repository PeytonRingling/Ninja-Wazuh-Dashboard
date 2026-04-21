import { Summary } from "../api/client";

interface Props {
  summary: Summary | null;
  summaryError: string | null;
  onSeverityClick?: (severity: string) => void;
  isDark?: boolean;
  onThemeToggle?: () => void;
  onSettingsClick?: () => void;
}

function SevBadge({
  label, count, color, onClick,
}: {
  label: string; count: number; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${color} ${
        onClick ? "cursor-pointer hover:opacity-90 active:scale-95" : "cursor-default"
      }`}
    >
      <span className="text-xs font-medium opacity-70 tracking-wide">{label}</span>
      <span className="font-bold tabular-nums text-base leading-none">{count.toLocaleString()}</span>
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

export default function TopBar({ summary, summaryError, onSeverityClick, isDark, onThemeToggle, onSettingsClick }: Props) {
  const w = summary?.wazuh;
  const n = summary?.ninja;

  return (
    <header
      className="sticky top-0 z-20"
      style={isDark ? {
        background:       "var(--body-bg)",
        borderBottom:     "1px solid transparent",
        backgroundImage:  "linear-gradient(var(--body-bg), var(--body-bg)), linear-gradient(90deg, var(--accent-color, #7c3aed), var(--accent-secondary, #a855f7))",
        backgroundOrigin: "padding-box, border-box",
        backgroundClip:   "padding-box, border-box",
        boxShadow:        "0 4px 32px rgba(0,0,0,0.6)",
      } : {
        background:   "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        boxShadow:    "0 1px 16px rgba(99, 102, 241, 0.07)",
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center gap-6">

        {/* Logo / Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(168,85,247,0.12))",
              border: "1px solid rgba(124,58,237,0.40)",
              boxShadow: "0 0 18px rgba(124,58,237,0.25)",
            }}
          >
            <svg className="w-4.5 h-4.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span
            className="text-sm font-bold hidden sm:block tracking-wide"
            style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            OPS DASHBOARD
          </span>
        </div>

        <div className="h-5 w-px bg-surface-600" />

        {/* Wazuh Severity Summary */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold shrink-0">Live Alerts</span>
          {w ? (
            <>
              <SevBadge label="Critical" count={w.critical} color="badge-critical" onClick={() => onSeverityClick?.("critical")} />
              <SevBadge label="High"     count={w.high}     color="badge-high"     onClick={() => onSeverityClick?.("high")} />
              <SevBadge label="Medium"   count={w.medium}   color="badge-medium"   onClick={() => onSeverityClick?.("medium")} />
              <SevBadge label="Low"      count={w.low}      color="badge-low"      onClick={() => onSeverityClick?.("low")} />
            </>
          ) : summary?.wazuh_error ? (
            <span className="text-xs text-red-400">Wazuh offline</span>
          ) : (
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-8 w-20 rounded-lg" />
              ))}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-surface-600 hidden md:block" />

        {/* NinjaOne Device Status */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Devices</span>
          {n ? (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Dot online={true} />
                <span className="font-bold text-green-400">{n.online}</span>
                <span className="text-slate-500 text-xs">online</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot online={false} />
                <span className="font-bold text-slate-400">{n.offline}</span>
                <span className="text-slate-500 text-xs">offline</span>
              </div>
            </div>
          ) : summary?.ninja_error ? (
            <span className="text-xs text-red-400">NinjaOne offline</span>
          ) : (
            <div className="skeleton h-5 w-32 rounded" />
          )}
        </div>

        {/* Spacer — pushes right-side content to the end */}
        <div className="flex-1" />

        {/* Critical alert banner */}
        {w && w.critical > 0 && (
          <button
            onClick={() => onSeverityClick?.("critical")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
            style={{
              background: "rgba(255,45,109,0.12)",
              border: "1px solid rgba(255,45,109,0.35)",
              color: "#ff2d6d",
              animation: "pulseGlowCritical 2s ease-in-out infinite",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "#ff2d6d" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#ff2d6d" }} />
            </span>
            {w.critical} critical {w.critical !== 1 ? "alerts" : "alert"} — action required
          </button>
        )}

        {summaryError && (
          <div className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
            {summaryError}
          </div>
        )}

        {/* Icon buttons: settings + theme toggle */}
        <div className="flex items-center gap-1 shrink-0">
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-700 transition-colors"
              title="Settings (S)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-700 transition-colors"
              title={isDark ? "Switch to light mode (D)" : "Switch to dark mode (D)"}
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
