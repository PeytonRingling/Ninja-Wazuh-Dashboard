import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api, NinjaDevice, WazuhAgent, AgentAlertSummary, WazuhAlert } from "../../api/client";
import RefreshButton from "../RefreshButton";
import { formatDistanceToNow, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CorrelatedDevice {
  key: string;
  displayName: string;
  ninja?: NinjaDevice;
  wazuhAgent?: WazuhAgent;
  alerts?: AgentAlertSummary;
}

type FilterMode = "all" | "no_wazuh" | "rogue" | "critical" | "offline_alerts";
type ViewMode   = "cards" | "table";
type RiskCat    = "critical" | "offlineAlerts" | "noSIEM" | "rogue" | "healthy";

// ── Risk categorization ───────────────────────────────────────────────────────

const CAT_META: Record<RiskCat, {
  label: string; filterKey: FilterMode;
  accentBar: string; accentBorder: string; accentText: string; accentBg: string; accentRing: string;
}> = {
  critical:      { label: "Critical Alerts",  filterKey: "critical",       accentBar: "bg-red-500",    accentBorder: "border-red-500/35",    accentText: "text-red-400",    accentBg: "bg-red-500/5",    accentRing: "ring-red-500/30" },
  offlineAlerts: { label: "Offline + Alerts", filterKey: "offline_alerts", accentBar: "bg-orange-500", accentBorder: "border-orange-500/35", accentText: "text-orange-400", accentBg: "bg-orange-500/5", accentRing: "ring-orange-500/30" },
  noSIEM:        { label: "No SIEM Coverage", filterKey: "no_wazuh",       accentBar: "bg-yellow-500", accentBorder: "border-yellow-500/35", accentText: "text-yellow-400", accentBg: "bg-yellow-500/5", accentRing: "ring-yellow-500/30" },
  rogue:         { label: "Not in RMM",       filterKey: "rogue",          accentBar: "bg-purple-500", accentBorder: "border-purple-500/35", accentText: "text-purple-400", accentBg: "bg-purple-500/5", accentRing: "ring-purple-500/30" },
  healthy:       { label: "Healthy",          filterKey: "all",            accentBar: "bg-green-500",  accentBorder: "border-surface-600",   accentText: "text-green-400",  accentBg: "",                accentRing: "ring-green-500/25" },
};

function getCategory(d: CorrelatedDevice): RiskCat {
  if ((d.alerts?.critical ?? 0) > 0)                                    return "critical";
  if (d.ninja && d.ninja.offline && (d.alerts?.total ?? 0) > 0)        return "offlineAlerts";
  if (d.ninja && !d.wazuhAgent)                                         return "noSIEM";
  if (!d.ninja && d.wazuhAgent)                                         return "rogue";
  return "healthy";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string { return (s ?? "").toLowerCase().trim().split(".")[0]; }

function fmtAgo(ts: string | number | undefined): string {
  if (!ts) return "—";
  try {
    const d = typeof ts === "number" ? new Date(ts * 1000) : parseISO(ts as string);
    if (isNaN(d.getTime())) return String(ts);
    return formatDistanceToNow(d, { addSuffix: true });
  } catch { return String(ts); }
}

function riskScore(d: CorrelatedDevice): number {
  const a = d.alerts;
  if (!a) return -1;
  return a.critical * 100000 + a.high * 10000 + a.medium * 100 + a.low;
}

function levelToSeverity(level: number): string {
  if (level >= 15) return "critical";
  if (level >= 12) return "high";
  if (level >= 7)  return "medium";
  return "low";
}

function osShort(d: CorrelatedDevice): string {
  const raw = d.ninja?.os?.name ?? d.ninja?.system?.name ?? "";
  if (!raw) return "Unknown OS";
  return raw.replace(/Microsoft Windows /i, "Win ").split(" ").slice(0, 3).join(" ");
}

function getOsFamily(d: CorrelatedDevice): string {
  const os = (d.ninja?.os?.name ?? d.ninja?.system?.name ?? "").toLowerCase();
  if (!os) return "unknown";
  if (os.includes("windows")) {
    if (os.includes("windows 11"))     return "windows_11";
    if (os.includes("windows 10"))     return "windows_10";
    if (os.includes("windows 8"))      return "windows_8";
    if (os.includes("server"))         return "windows_server";
    return "windows";
  }
  if (os.includes("linux") || os.includes("ubuntu") || os.includes("centos") || os.includes("debian") || os.includes("rhel") || os.includes("fedora")) return "linux";
  if (os.includes("macos") || os.includes("mac os") || os.includes("darwin")) return "macos";
  return "other";
}

function getDeviceType(d: CorrelatedDevice): string {
  const nc = (d.ninja?.nodeClass ?? "").toLowerCase();
  if (!nc) return d.ninja ? "unknown" : "no_rmm";
  if (nc.includes("workstation")) return "workstation";
  if (nc.includes("server"))      return "server";
  if (nc.includes("mac"))         return "mac";
  if (nc.includes("mobile") || nc.includes("tablet")) return "mobile";
  return "other";
}

function getDeviceIPs(d: CorrelatedDevice): string[] {
  const ips: string[] = [];
  if (d.ninja?.ipAddresses) ips.push(...d.ninja.ipAddresses);
  if (d.wazuhAgent?.ip && !ips.includes(d.wazuhAgent.ip)) ips.push(d.wazuhAgent.ip);
  return ips;
}

// ── Fleet health ring ─────────────────────────────────────────────────────────

function FleetScoreRing({ score, loading }: { score: number; loading: boolean }) {
  const r = 38, circ = 2 * Math.PI * r;
  const ringColor = score >= 80 ? "#4ade80" : score >= 60 ? "#facc15" : score >= 40 ? "#fb923c" : "#f87171";
  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
        {!loading && (
          <circle cx="56" cy="56" r={r} fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
            style={{ transition: "stroke-dashoffset 1s ease, stroke 0.5s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {loading
          ? <div className="skeleton w-12 h-8 rounded" />
          : <><span className="text-2xl font-bold tabular-nums leading-none" style={{ color: ringColor }}>{score}</span>
             <span className="text-xs text-slate-500 mt-0.5">% healthy</span></>
        }
      </div>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string; desc: string; value: number | null;
  icon: string; iconBg: string; iconColor: string; countColor: string; border: string;
  active: boolean; onClick: () => void;
}
function MetricCard({ label, desc, value, icon, iconBg, iconColor, countColor, border, active, onClick }: MetricCardProps) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${border} ${
        active ? "bg-surface-700/70 ring-1 ring-accent/40" : "bg-surface-700/20 hover:bg-surface-700/50"
      }`}
    >
      <div className={`${iconBg} rounded-lg p-2 shrink-0`}>
        <svg className={`w-4 h-4 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <div className={`text-xl font-bold tabular-nums leading-tight ${countColor}`}>
          {value === null ? <span className="skeleton inline-block w-8 h-5 rounded" /> : value}
        </div>
        <div className="text-xs font-medium text-slate-300 leading-tight">{label}</div>
        <div className="text-xs text-slate-600 leading-tight">{desc}</div>
      </div>
    </button>
  );
}

// ── Coverage breakdown bar (clickable segments) ───────────────────────────────

interface BarSegment { label: string; count: number; color: string; dotColor: string; filterKey?: FilterMode; }

function CoverageBar({ segments, total, onSegmentClick }: {
  segments: BarSegment[]; total: number; onSegmentClick?: (f: FilterMode) => void;
}) {
  if (!total) return null;
  const active = segments.filter((s) => s.count > 0);
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {active.map((s) => (
          <button
            key={s.label}
            title={`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%) — click to filter`}
            onClick={() => s.filterKey && onSegmentClick?.(s.filterKey)}
            className={`${s.color} transition-all duration-700 rounded-full ${s.filterKey ? "cursor-pointer hover:brightness-125 hover:scale-y-125" : "cursor-default"}`}
            style={{ width: `${(s.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex gap-x-5 gap-y-1.5 mt-3 flex-wrap">
        {active.map((s) => (
          <button
            key={s.label}
            onClick={() => s.filterKey && onSegmentClick?.(s.filterKey)}
            className={`flex items-center gap-1.5 transition-opacity ${s.filterKey ? "hover:opacity-70 cursor-pointer" : "cursor-default"}`}
          >
            <div className={`w-2 h-2 rounded-full ${s.dotColor}`} />
            <span className="text-xs text-slate-400">{s.label}</span>
            <span className="text-xs font-semibold text-slate-200 tabular-nums">{s.count}</span>
            <span className="text-xs text-slate-600">({Math.round((s.count / total) * 100)}%)</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Alert counts chips ────────────────────────────────────────────────────────

function AlertCounts({ alerts }: { alerts?: AgentAlertSummary }) {
  if (!alerts || alerts.total === 0) return <span className="text-xs text-slate-700">No alerts</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {alerts.critical > 0 && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/25 tabular-nums">{alerts.critical}</span>}
      {alerts.high    > 0 && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 tabular-nums">{alerts.high}</span>}
      {alerts.medium  > 0 && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 tabular-nums">{alerts.medium}</span>}
      {alerts.low     > 0 && <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-700/60 text-slate-400 tabular-nums">{alerts.low}</span>}
    </div>
  );
}

// ── Device card (expands inline with col-span-full) ──────────────────────────

function DeviceCard({ device, selected, hoursBack, onSelect }: {
  device: CorrelatedDevice; selected: boolean; hoursBack: number; onSelect: () => void;
}) {
  const [recentAlerts, setRecentAlerts] = useState<WazuhAlert[] | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const fetchedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch alerts lazily when expanded
  useEffect(() => {
    if (!selected || !device.wazuhAgent || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoadingAlerts(true);
    api.wazuhAlerts({ agent: device.wazuhAgent.name, limit: 5, hours_back: hoursBack })
      .then(r => setRecentAlerts(r.alerts))
      .catch(() => setRecentAlerts([]))
      .finally(() => setLoadingAlerts(false));
  }, [selected, device.wazuhAgent, hoursBack]);

  // Scroll expanded card into view
  useEffect(() => {
    if (selected && cardRef.current) {
      setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    }
  }, [selected]);

  const cat    = getCategory(device);
  const meta   = CAT_META[cat];
  const isOnline = device.ninja ? !device.ninja.offline : null;
  const a = device.alerts;

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border bg-surface-800 overflow-hidden transition-all ${
        selected
          ? `col-span-full ${meta.accentBorder} ring-2 ${meta.accentRing}`
          : `border-surface-600`
      }`}
    >
      {/* Colored accent top bar */}
      <div className={`h-0.5 w-full ${meta.accentBar}`} />

      {/* Compact header — always clickable */}
      <button
        onClick={onSelect}
        className={`w-full text-left p-4 transition-colors ${selected ? "hover:bg-surface-700/30" : "hover:bg-surface-700/40"}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {isOnline === null
              ? <span className="inline-flex w-2 h-2 rounded-full bg-purple-400/70 shrink-0" />
              : isOnline
              ? <span className="inline-flex w-2 h-2 rounded-full bg-green-400 shadow-[0_0_5px_#4ade80] shrink-0" />
              : <span className="inline-flex w-2 h-2 rounded-full bg-slate-500 shrink-0" />
            }
            <span className="text-sm font-semibold text-slate-100 truncate">{device.displayName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!device.wazuhAgent
              ? <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 leading-tight">No SIEM</span>
              : device.wazuhAgent.status === "active"
              ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 leading-tight">SIEM ✓</span>
              : <span className="text-xs px-1.5 py-0.5 rounded bg-slate-600/50 text-slate-400 border border-slate-600 capitalize leading-tight">{device.wazuhAgent.status}</span>
            }
            <span className={`text-slate-400 text-xs transition-transform duration-200 ${selected ? "rotate-180" : ""}`}>▾</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
          <span className="truncate">{osShort(device)}</span>
          <span className="text-surface-600 shrink-0">·</span>
          <span className={`shrink-0 ${isOnline ? "text-green-500" : isOnline === false ? "text-slate-500" : "text-purple-400"}`}>
            {isOnline === null ? "Not in RMM" : isOnline ? "Online" : "Offline"}
          </span>
          {(device.ninja?.lastContact || device.ninja?.lastSeenAt) && (
            <span className="text-slate-600 shrink-0 truncate">{fmtAgo(device.ninja?.lastContact ?? device.ninja?.lastSeenAt)}</span>
          )}
        </div>

        {device.ninja?.lastLoggedOnUser && (
          <div className="flex items-center gap-1.5 text-xs mb-3">
            <svg className="w-3 h-3 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-slate-400 font-mono truncate">{device.ninja.lastLoggedOnUser}</span>
          </div>
        )}

        <div className="mb-2.5"><AlertCounts alerts={a} /></div>

        {a?.latest?.description
          ? <div className="border-t border-surface-700 pt-2">
              <p className="text-xs text-slate-500 truncate">{a.latest.description}</p>
            </div>
          : <div className="border-t border-surface-700/50 pt-2">
              <p className="text-xs text-slate-700">No recent alerts</p>
            </div>
        }
      </button>

      {/* Expanded details — inline below compact header */}
      {selected && (
        <div className="border-t border-surface-700 px-5 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* NinjaOne panel */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">NinjaOne RMM</h4>
              {device.ninja ? (
                <div className="bg-surface-900/60 rounded-xl border border-surface-600 divide-y divide-surface-700/60">
                  {([
                    ["Status",   <span className={`font-semibold ${isOnline ? "text-green-400" : "text-slate-400"}`}>{isOnline ? "● Online" : "○ Offline"}</span>] as [string, React.ReactNode],
                    ["Last Seen", fmtAgo(device.ninja.lastContact ?? device.ninja.lastSeenAt)] as [string, React.ReactNode],
                    ...(device.ninja.lastLoggedOnUser ? [["Logged On", <span className="font-mono">{device.ninja.lastLoggedOnUser}</span>] as [string, React.ReactNode]] : []),
                    ...(device.ninja.os?.name ? [["OS", device.ninja.os.name] as [string, React.ReactNode]] : []),
                    ...(device.ninja.ipAddresses?.length ? [["IPs", <span className="font-mono">{device.ninja.ipAddresses!.join(", ")}</span>] as [string, React.ReactNode]] : []),
                    ...(device.ninja.nodeClass ? [["Type", device.ninja.nodeClass.toLowerCase().replace(/_/g, " ")] as [string, React.ReactNode]] : []),
                    ...((device.ninja.system?.manufacturer || device.ninja.system?.model) ? [["Hardware", [device.ninja.system?.manufacturer, device.ninja.system?.model].filter(Boolean).join(" ")] as [string, React.ReactNode]] : []),
                  ]).map(([k, v], i) => (
                    <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
                      <span className="text-slate-500 text-xs w-20 shrink-0 capitalize">{k}</span>
                      <span className="text-xs text-slate-300 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-surface-900/60 rounded-xl border border-purple-500/20 px-4 py-4">
                  <p className="text-xs text-purple-300/70 leading-relaxed">Not registered in NinjaOne RMM. May be a rogue, decommissioned, or unmanaged device.</p>
                </div>
              )}
            </div>

            {/* Wazuh panel */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                Wazuh SIEM — Recent Alerts
                {device.wazuhAgent && (
                  <span className={`normal-case font-normal text-xs px-1.5 py-0.5 rounded border ${
                    device.wazuhAgent.status === "active"
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-slate-600/50 text-slate-400 border-slate-600"
                  }`}>{device.wazuhAgent.status}</span>
                )}
              </h4>
              {!device.wazuhAgent ? (
                <div className="bg-surface-900/60 rounded-xl border border-yellow-500/20 px-4 py-4">
                  <p className="text-xs text-yellow-300/70">No Wazuh agent registered for this device.</p>
                </div>
              ) : loadingAlerts ? (
                <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
              ) : recentAlerts && recentAlerts.length > 0 ? (
                <div className="bg-surface-900/60 rounded-xl border border-surface-600 divide-y divide-surface-700/60 overflow-hidden">
                  {recentAlerts.map((alert) => {
                    const sev = levelToSeverity(alert.rule?.level ?? 0);
                    const lc: Record<string,string> = { critical:"text-red-400", high:"text-orange-400", medium:"text-yellow-400", low:"text-slate-400" };
                    return (
                      <div key={alert.id} className="px-4 py-3">
                        <p className="text-xs text-slate-200 leading-snug">{alert.rule?.description ?? "—"}</p>
                        <div className="flex gap-2.5 mt-1">
                          <span className="text-xs font-mono text-slate-500">Rule {alert.rule?.id}</span>
                          <span className={`text-xs font-semibold ${lc[sev]}`}>Level {alert.rule?.level}</span>
                          {alert.timestamp && <span className="text-xs text-slate-600">{fmtAgo(alert.timestamp)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-surface-900/60 rounded-xl border border-surface-600 px-4 py-4">
                  <p className="text-xs text-slate-500">No alerts in the last {hoursBack}h</p>
                </div>
              )}
              {device.wazuhAgent && (
                <div className="mt-2 flex gap-4 text-xs text-slate-600 flex-wrap">
                  <span>Agent <span className="font-mono text-slate-500">{device.wazuhAgent.id}</span></span>
                  {device.wazuhAgent.version && <span>v{device.wazuhAgent.version}</span>}
                  {device.wazuhAgent.lastKeepAlive && <span>Keepalive <span className="text-slate-500">{fmtAgo(device.wazuhAgent.lastKeepAlive)}</span></span>}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Device group section ──────────────────────────────────────────────────────

function DeviceGroup({ cat, devices, selectedKey, hoursBack, onSelect }: {
  cat: RiskCat; devices: CorrelatedDevice[]; selectedKey: string | null; hoursBack: number;
  onSelect: (d: CorrelatedDevice | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = CAT_META[cat];
  if (devices.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2.5 w-full mb-3 group"
      >
        <span className={`text-xs font-bold uppercase tracking-widest ${meta.accentText}`}>{meta.label}</span>
        <span className="text-xs font-semibold text-slate-500 tabular-nums">({devices.length})</span>
        <div className={`flex-1 h-px border-t ${meta.accentBorder} ml-1 opacity-50`} />
        <span className={`text-slate-500 text-xs transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}>▾</span>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {devices.map((d) => (
            <DeviceCard
              key={d.key}
              device={d}
              selected={selectedKey === d.key}
              hoursBack={hoursBack}
              onSelect={() => onSelect(selectedKey === d.key ? null : d)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Device detail panel ───────────────────────────────────────────────────────

function DeviceDetailPanel({ device, hoursBack, onClose }: {
  device: CorrelatedDevice; hoursBack: number; onClose: () => void;
}) {
  const [recentAlerts, setRecentAlerts] = useState<WazuhAlert[] | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  useEffect(() => {
    if (!device.wazuhAgent) { setRecentAlerts([]); return; }
    setLoadingAlerts(true);
    setRecentAlerts(null);
    api.wazuhAlerts({ agent: device.wazuhAgent.name, limit: 5, hours_back: hoursBack })
      .then(r => setRecentAlerts(r.alerts))
      .catch(() => setRecentAlerts([]))
      .finally(() => setLoadingAlerts(false));
  }, [device, hoursBack]);

  const cat = getCategory(device);
  const meta = CAT_META[cat];
  const isOnline = device.ninja ? !device.ninja.offline : null;
  const a = device.alerts;

  return (
    <div className={`rounded-2xl border ${meta.accentBorder} bg-surface-800/80 overflow-hidden`}>
      {/* Accent bar */}
      <div className={`h-1 w-full ${meta.accentBar}`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className={`w-1.5 h-10 rounded-full ${meta.accentBar} shrink-0 mt-0.5`} />
            <div>
              <h3 className="text-lg font-bold text-slate-100 leading-tight">{device.displayName}</h3>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-xs font-medium ${meta.accentText}`}>{meta.label}</span>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-400">{osShort(device)}</span>
                {isOnline !== null && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className={`text-xs font-medium ${isOnline ? "text-green-400" : "text-slate-400"}`}>
                      {isOnline ? "Online" : "Offline"} {fmtAgo(device.ninja?.lastContact ?? device.ninja?.lastSeenAt)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {a && a.total > 0 && <AlertCounts alerts={a} />}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-surface-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Two-column detail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* NinjaOne column */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">NinjaOne RMM</h4>
            {device.ninja ? (
              <div className="bg-surface-900/60 rounded-xl border border-surface-600 divide-y divide-surface-700/60">
                {([
                  ["Status",    <span className={`font-semibold ${isOnline ? "text-green-400" : "text-slate-400"}`}>{isOnline ? "● Online" : "○ Offline"}</span>] as [string, React.ReactNode],
                  ["Last Seen", fmtAgo(device.ninja.lastContact ?? device.ninja.lastSeenAt)] as [string, React.ReactNode],
                  ...(device.ninja.lastLoggedOnUser ? [["Logged On", <span className="font-mono">{device.ninja.lastLoggedOnUser}</span>] as [string, React.ReactNode]] : []),
                  ...(device.ninja.os?.name ? [["OS", device.ninja.os.name] as [string, React.ReactNode]] : []),
                  ...(device.ninja.ipAddresses?.length ? [["IPs", <span className="font-mono">{device.ninja.ipAddresses!.join(", ")}</span>] as [string, React.ReactNode]] : []),
                  ...(device.ninja.nodeClass ? [["Type", device.ninja.nodeClass.toLowerCase().replace(/_/g, " ")] as [string, React.ReactNode]] : []),
                  ...((device.ninja.system?.manufacturer || device.ninja.system?.model) ? [["Hardware", [device.ninja.system?.manufacturer, device.ninja.system?.model].filter(Boolean).join(" ")] as [string, React.ReactNode]] : []),
                ]).map(([k, v], i) => (
                  <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
                    <span className="text-slate-500 text-xs w-20 shrink-0 capitalize">{k}</span>
                    <span className="text-xs text-slate-300 break-all">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface-900/60 rounded-xl border border-purple-500/20 px-4 py-4">
                <p className="text-xs text-purple-300/70 leading-relaxed">Not registered in NinjaOne RMM. May be a rogue, decommissioned, or unmanaged device.</p>
              </div>
            )}
          </div>

          {/* Wazuh column */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              Wazuh SIEM — Recent Alerts
              {device.wazuhAgent && (
                <span className={`normal-case font-normal text-xs px-1.5 py-0.5 rounded border ${
                  device.wazuhAgent.status === "active"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-slate-600/50 text-slate-400 border-slate-600"
                }`}>{device.wazuhAgent.status}</span>
              )}
            </h4>
            {!device.wazuhAgent ? (
              <div className="bg-surface-900/60 rounded-xl border border-yellow-500/20 px-4 py-4">
                <p className="text-xs text-yellow-300/70 leading-relaxed">No Wazuh agent registered for this device — no SIEM monitoring coverage.</p>
              </div>
            ) : loadingAlerts ? (
              <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
            ) : recentAlerts && recentAlerts.length > 0 ? (
              <div className="bg-surface-900/60 rounded-xl border border-surface-600 divide-y divide-surface-700/60 overflow-hidden">
                {recentAlerts.map((alert) => {
                  const sev = levelToSeverity(alert.rule?.level ?? 0);
                  const lc: Record<string, string> = { critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400", low: "text-slate-400" };
                  return (
                    <div key={alert.id} className="px-4 py-3">
                      <p className="text-xs text-slate-200 leading-snug">{alert.rule?.description ?? "—"}</p>
                      <div className="flex gap-2.5 mt-1">
                        <span className="text-xs font-mono text-slate-500">Rule {alert.rule?.id}</span>
                        <span className={`text-xs font-semibold ${lc[sev]}`}>Level {alert.rule?.level}</span>
                        {alert.timestamp && <span className="text-xs text-slate-600">{fmtAgo(alert.timestamp)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-surface-900/60 rounded-xl border border-surface-600 px-4 py-4">
                <p className="text-xs text-slate-500">No alerts in the last {hoursBack}h</p>
              </div>
            )}
            {device.wazuhAgent && (
              <div className="mt-2 flex gap-4 text-xs text-slate-600 flex-wrap">
                <span>Agent <span className="font-mono text-slate-500">{device.wazuhAgent.id}</span></span>
                {device.wazuhAgent.version && <span>v{device.wazuhAgent.version}</span>}
                {device.wazuhAgent.lastKeepAlive && <span>Keepalive <span className="text-slate-500">{fmtAgo(device.wazuhAgent.lastKeepAlive)}</span></span>}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Table row (for table view) ────────────────────────────────────────────────

function TableRow({ device, hoursBack }: { device: CorrelatedDevice; hoursBack: number }) {
  const [expanded, setExpanded] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState<WazuhAlert[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (!expanded || !device.wazuhAgent || fetched.current) return;
    fetched.current = true;
    setLoading(true);
    api.wazuhAlerts({ agent: device.wazuhAgent.name, limit: 5, hours_back: hoursBack })
      .then(r => setRecentAlerts(r.alerts))
      .catch(() => setRecentAlerts([]))
      .finally(() => setLoading(false));
  }, [expanded, device.wazuhAgent, hoursBack]);

  const cat = getCategory(device);
  const meta = CAT_META[cat];
  const isOnline = device.ninja ? !device.ninja.offline : null;
  const a = device.alerts;

  const rowBg = cat === "critical"      ? "border-l-2 border-l-red-500 bg-red-500/[0.03]"
              : cat === "offlineAlerts" ? "border-l-2 border-l-orange-500 bg-orange-500/[0.03]"
              : cat === "noSIEM"        ? "border-l-2 border-l-yellow-500/50"
              : cat === "rogue"         ? "border-l-2 border-l-purple-500/40"
              : "";

  const statusDot = isOnline === null
    ? <span className="inline-flex w-2.5 h-2.5 rounded-full bg-purple-400/70" />
    : isOnline
    ? <span className="inline-flex w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
    : <span className="inline-flex w-2.5 h-2.5 rounded-full bg-slate-500" />;

  const wazuhBadge = !device.wazuhAgent
    ? <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">No agent</span>
    : device.wazuhAgent.status === "active"
    ? <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
    : <span className="px-1.5 py-0.5 rounded text-xs bg-slate-600/50 text-slate-400 border border-slate-600 capitalize">{device.wazuhAgent.status}</span>;

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)}
        className={`border-b border-surface-700/50 cursor-pointer transition-colors hover:bg-surface-700/40 ${rowBg} ${expanded ? "bg-surface-700/20" : ""}`}>
        <td className="py-2.5 px-3"><div className="flex justify-center">{statusDot}</div></td>
        <td className="py-2.5 px-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-slate-100">{device.displayName}</span>
            <span className={`text-xs ${meta.accentText}`}>{meta.label}</span>
          </div>
        </td>
        <td className="py-2.5 px-3 text-xs text-slate-400">{osShort(device)}</td>
        <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">{fmtAgo(device.ninja?.lastContact ?? device.ninja?.lastSeenAt)}</td>
        <td className="py-2.5 px-3">{wazuhBadge}</td>
        <td className="py-2.5 px-3"><AlertCounts alerts={a} /></td>
        <td className="py-2.5 px-3 text-xs text-slate-400 max-w-xs">
          {a?.latest ? (
            <div>
              <span className="truncate block" title={a.latest.description}>{a.latest.description}</span>
              {a.latest.timestamp && <span className="text-slate-600">{fmtAgo(a.latest.timestamp)}</span>}
            </div>
          ) : "—"}
        </td>
        <td className="py-2.5 px-3 text-center">
          <span className={`text-slate-500 text-xs inline-block transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▾</span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-surface-600">
          <td colSpan={8} className="bg-surface-900/60 px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">NinjaOne RMM</h4>
                {device.ninja ? (
                  <div className="bg-surface-800 rounded-xl border border-surface-600 px-4 py-3 space-y-2">
                    {device.ninja.lastLoggedOnUser && <div className="flex gap-3"><span className="text-slate-500 text-xs w-24 shrink-0">Logged On</span><span className="text-xs font-mono text-slate-300">{device.ninja.lastLoggedOnUser}</span></div>}
                    {device.ninja.os?.name && <div className="flex gap-3"><span className="text-slate-500 text-xs w-24 shrink-0">OS</span><span className="text-xs text-slate-300">{device.ninja.os.name}</span></div>}
                    {device.ninja.ipAddresses?.length && <div className="flex gap-3"><span className="text-slate-500 text-xs w-24 shrink-0">IPs</span><span className="text-xs font-mono text-slate-300">{device.ninja.ipAddresses.join(", ")}</span></div>}
                    {device.ninja.nodeClass && <div className="flex gap-3"><span className="text-slate-500 text-xs w-24 shrink-0">Type</span><span className="text-xs text-slate-300 capitalize">{device.ninja.nodeClass.toLowerCase().replace(/_/g, " ")}</span></div>}
                  </div>
                ) : <div className="bg-surface-800 rounded-xl border border-purple-500/20 px-4 py-3"><p className="text-xs text-purple-300/70">Not in NinjaOne RMM.</p></div>}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Alerts</h4>
                {loading ? <div className="space-y-1.5">{[1,2,3].map(i=><div key={i} className="skeleton h-9 rounded-lg"/>)}</div>
                : !device.wazuhAgent ? <div className="bg-surface-800 rounded-xl border border-yellow-500/20 px-4 py-3"><p className="text-xs text-yellow-300/70">No Wazuh agent.</p></div>
                : recentAlerts?.length === 0 ? <div className="bg-surface-800 rounded-xl border border-surface-600 px-4 py-3"><p className="text-xs text-slate-500">No alerts in last {hoursBack}h</p></div>
                : <div className="bg-surface-800 rounded-xl border border-surface-600 divide-y divide-surface-700/60 overflow-hidden">
                    {recentAlerts?.map(alert => {
                      const sev = levelToSeverity(alert.rule?.level ?? 0);
                      const lc: Record<string,string> = { critical:"text-red-400", high:"text-orange-400", medium:"text-yellow-400", low:"text-slate-400" };
                      return <div key={alert.id} className="px-4 py-2.5">
                        <p className="text-xs text-slate-200">{alert.rule?.description}</p>
                        <div className="flex gap-2 mt-0.5">
                          <span className="text-xs font-mono text-slate-500">Rule {alert.rule?.id}</span>
                          <span className={`text-xs font-semibold ${lc[sev]}`}>L{alert.rule?.level}</span>
                          {alert.timestamp && <span className="text-xs text-slate-600">{fmtAgo(alert.timestamp)}</span>}
                        </div>
                      </div>;
                    })}
                  </div>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function EndpointIntelTab() {
  const [ninjaDevices, setNinjaDevices] = useState<NinjaDevice[] | null>(null);
  const [wazuhAgents,  setWazuhAgents]  = useState<WazuhAgent[] | null>(null);
  const [agentSummary, setAgentSummary] = useState<AgentAlertSummary[] | null>(null);
  const [filter,       setFilter]       = useState<FilterMode>("all");
  const [search,       setSearch]       = useState("");
  const [hoursBack,    setHoursBack]    = useState(24);
  const [refreshing,   setRefreshing]   = useState(false);
  const [viewMode,     setViewMode]     = useState<ViewMode>("cards");
  const [selectedDevice, setSelectedDevice] = useState<CorrelatedDevice | null>(null);
  const [osFilter,       setOsFilter]       = useState("all");
  const [typeFilter,     setTypeFilter]     = useState("all");
  const [errors, setErrors] = useState<{ ninja?: string; wazuh?: string; summary?: string }>({});
  const load = useCallback(async () => {
    const [ninjaRes, wazuhRes, summaryRes] = await Promise.allSettled([
      api.ninjaDevices(), api.wazuhAgents(), api.wazuhAgentAlertSummary(hoursBack),
    ]);
    const errs: typeof errors = {};
    if (ninjaRes.status   === "fulfilled") setNinjaDevices(ninjaRes.value); else errs.ninja = ninjaRes.reason?.message ?? "Failed";
    if (wazuhRes.status   === "fulfilled") setWazuhAgents(wazuhRes.value);  else errs.wazuh = wazuhRes.reason?.message ?? "Failed";
    if (summaryRes.status === "fulfilled") setAgentSummary(summaryRes.value); else errs.summary = summaryRes.reason?.message ?? "Failed";
    setErrors(errs);
  }, [hoursBack]);

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([api.refreshNinja(), api.refreshWazuh()]);
    await load();
    setTimeout(() => setRefreshing(false), 800);
  };

  // ── Correlate ─────────────────────────────────────────────────────────────
  const correlated = useMemo((): CorrelatedDevice[] => {
    const summaryMap = new Map<string, AgentAlertSummary>();
    agentSummary?.forEach(s => summaryMap.set(norm(s.agent_name), s));
    const wazuhMap = new Map<string, WazuhAgent>();
    wazuhAgents?.forEach(a => wazuhMap.set(norm(a.name), a));
    const seen = new Set<string>();
    const result: CorrelatedDevice[] = [];
    ninjaDevices?.forEach(d => {
      const n = norm(d.systemName ?? d.displayName ?? "");
      if (!n || seen.has(n)) return;
      seen.add(n);
      result.push({ key: n, displayName: d.systemName ?? d.displayName ?? n, ninja: d, wazuhAgent: wazuhMap.get(n), alerts: summaryMap.get(n) });
    });
    wazuhAgents?.forEach(a => {
      const n = norm(a.name);
      if (!n || seen.has(n)) return;
      seen.add(n);
      result.push({ key: n, displayName: a.name, wazuhAgent: a, alerts: summaryMap.get(n) });
    });
    return result;
  }, [ninjaDevices, wazuhAgents, agentSummary]);

  // ── Stats & bar segments ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    let barHealthy = 0, barCritical = 0, barOffline = 0, barNoSIEM = 0, barRogue = 0;
    for (const d of correlated) {
      const c = getCategory(d);
      if      (c === "critical")      barCritical++;
      else if (c === "offlineAlerts") barOffline++;
      else if (c === "noSIEM")        barNoSIEM++;
      else if (c === "rogue")         barRogue++;
      else                            barHealthy++;
    }
    return {
      total:         correlated.length,
      correlated:    correlated.filter(d => d.ninja && d.wazuhAgent).length,
      noWazuh:       correlated.filter(d => d.ninja && !d.wazuhAgent).length,
      rogue:         correlated.filter(d => !d.ninja && d.wazuhAgent).length,
      critical:      correlated.filter(d => (d.alerts?.critical ?? 0) > 0).length,
      offlineAlerts: correlated.filter(d => d.ninja && d.ninja.offline && (d.alerts?.total ?? 0) > 0).length,
      barHealthy, barCritical, barOffline, barNoSIEM, barRogue,
      score: correlated.length > 0 ? Math.round(barHealthy / correlated.length * 100) : 100,
    };
  }, [correlated]);

  // ── Dropdown options (derived from full correlated list) ─────────────────
  const filterOptions = useMemo(() => {
    const OS_LABELS: Record<string, string> = {
      windows_11:     "Windows 11",
      windows_10:     "Windows 10",
      windows_server: "Windows Server",
      windows_8:      "Windows 8",
      windows:        "Windows (Other)",
      linux:          "Linux",
      macos:          "macOS",
      other:          "Other OS",
      unknown:        "Unknown OS",
    };
    const TYPE_LABELS: Record<string, string> = { workstation: "Workstation", server: "Server", mac: "Mac", mobile: "Mobile", other: "Other", unknown: "Unknown Type", no_rmm: "Not in RMM" };
    const osCounts   = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    correlated.forEach(d => {
      const o = getOsFamily(d);   osCounts.set(o,   (osCounts.get(o)   ?? 0) + 1);
      const t = getDeviceType(d); typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    });
    return {
      os:    [...osCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([k,c])=>({ key: k, label: OS_LABELS[k]   ?? k, count: c })),
      types: [...typeCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([k,c])=>({ key: k, label: TYPE_LABELS[k] ?? k, count: c })),
    };
  }, [correlated]);

  // ── Filtered + sorted ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = correlated;
    switch (filter) {
      case "no_wazuh":       list = list.filter(d => d.ninja && !d.wazuhAgent); break;
      case "rogue":          list = list.filter(d => !d.ninja && d.wazuhAgent); break;
      case "critical":       list = list.filter(d => (d.alerts?.critical ?? 0) > 0); break;
      case "offline_alerts": list = list.filter(d => d.ninja && d.ninja.offline && (d.alerts?.total ?? 0) > 0); break;
    }
    if (osFilter   !== "all") list = list.filter(d => getOsFamily(d)   === osFilter);
    if (typeFilter !== "all") list = list.filter(d => getDeviceType(d) === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.displayName.toLowerCase().includes(q) ||
        getDeviceIPs(d).some(ip => ip.includes(q))
      );
    }
    return [...list].sort((a, b) => riskScore(b) - riskScore(a));
  }, [correlated, filter, osFilter, typeFilter, search]);

  // For grouped card view: split filtered into risk categories
  const groups = useMemo(() => {
    const map = new Map<RiskCat, CorrelatedDevice[]>([
      ["critical", []], ["offlineAlerts", []], ["noSIEM", []], ["rogue", []], ["healthy", []],
    ]);
    filtered.forEach(d => map.get(getCategory(d))!.push(d));
    return map;
  }, [filtered]);

  const handleSelectDevice = (d: CorrelatedDevice | null) => {
    setSelectedDevice(d);
  };

  const loading = !ninjaDevices && !wazuhAgents;

  // Metric cards
  const METRICS: (MetricCardProps & { fk: FilterMode })[] = [
    { fk: "all",            label: "Total",          desc: "Across both systems",   value: loading ? null : stats.total,         icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2", iconBg: "bg-slate-700/60", iconColor: "text-slate-300", countColor: "text-slate-100", border: "border-surface-600", active: filter === "all",            onClick: () => setFilter("all") },
    { fk: "all",            label: "Correlated",     desc: "In both RMM & SIEM",    value: loading ? null : stats.correlated,    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1", iconBg: "bg-green-500/15", iconColor: "text-green-400", countColor: "text-green-400", border: "border-green-500/15", active: false, onClick: () => setFilter("all") },
    { fk: "no_wazuh",       label: "No SIEM",        desc: "RMM only, unmonitored", value: loading ? null : stats.noWazuh,       icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", iconBg: "bg-yellow-500/15", iconColor: "text-yellow-400", countColor: "text-yellow-400", border: "border-yellow-500/15", active: filter === "no_wazuh",       onClick: () => setFilter("no_wazuh") },
    { fk: "rogue",          label: "Not in RMM",     desc: "SIEM only, unmanaged",  value: loading ? null : stats.rogue,         icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", iconBg: "bg-purple-500/15", iconColor: "text-purple-400", countColor: "text-purple-400", border: "border-purple-500/15", active: filter === "rogue",          onClick: () => setFilter("rogue") },
    { fk: "critical",       label: "Critical",       desc: "Active critical events", value: loading ? null : stats.critical,      icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", iconBg: "bg-red-500/15", iconColor: "text-red-400", countColor: "text-red-400", border: "border-red-500/15", active: filter === "critical",       onClick: () => setFilter("critical") },
    { fk: "offline_alerts", label: "Offline+Alerts", desc: "Went dark with activity", value: loading ? null : stats.offlineAlerts, icon: "M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a8 8 0 000 11.314M9.172 9.172a4 4 0 000 5.656M12 12h.01", iconBg: "bg-orange-500/15", iconColor: "text-orange-400", countColor: "text-orange-400", border: "border-orange-500/15", active: filter === "offline_alerts", onClick: () => setFilter("offline_alerts") },
  ];

  const BAR_SEGMENTS: BarSegment[] = [
    { label: "Healthy",         count: stats.barHealthy,  color: "bg-green-500",  dotColor: "bg-green-500" },
    { label: "Critical Alerts", count: stats.barCritical, color: "bg-red-500",    dotColor: "bg-red-500",   filterKey: "critical" },
    { label: "Offline + Alerts",count: stats.barOffline,  color: "bg-orange-500", dotColor: "bg-orange-500", filterKey: "offline_alerts" },
    { label: "No SIEM",         count: stats.barNoSIEM,   color: "bg-yellow-500", dotColor: "bg-yellow-500", filterKey: "no_wazuh" },
    { label: "Not in RMM",      count: stats.barRogue,    color: "bg-purple-500", dotColor: "bg-purple-500", filterKey: "rogue" },
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* ── Hero banner ── */}
      <div className="relative rounded-2xl overflow-hidden border border-surface-600 bg-surface-800">
        {/* Decorative gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] via-transparent to-purple-500/[0.04] pointer-events-none" />
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-accent/[0.06] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-56 h-40 rounded-full bg-purple-500/[0.04] blur-3xl pointer-events-none" />

        <div className="relative p-6 flex flex-col gap-6">

          {/* Row 1: large score ring + title + KPI stats + refresh */}
          <div className="flex items-center gap-6 flex-wrap">

            {/* Large fleet score ring */}
            <div className="relative flex items-center justify-center w-36 h-36 shrink-0">
              {(() => {
                const r = 52, circ = 2 * Math.PI * r;
                const ringColor = stats.score >= 80 ? "#4ade80" : stats.score >= 60 ? "#facc15" : stats.score >= 40 ? "#fb923c" : "#f87171";
                return (
                  <>
                    <svg width="144" height="144" viewBox="0 0 144 144" className="-rotate-90">
                      <circle cx="72" cy="72" r={r} fill="none" stroke="#1e293b" strokeWidth="9" />
                      {!loading && (
                        <circle cx="72" cy="72" r={r} fill="none" stroke={ringColor} strokeWidth="9"
                          strokeLinecap="round" strokeDasharray={circ}
                          strokeDashoffset={circ * (1 - stats.score / 100)}
                          style={{ transition: "stroke-dashoffset 1s ease, stroke 0.5s ease" }}
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {loading
                        ? <div className="skeleton w-14 h-10 rounded" />
                        : <><span className="text-3xl font-bold tabular-nums leading-none" style={{ color: ringColor }}>{stats.score}</span>
                           <span className="text-[11px] text-slate-500 mt-1 tracking-wide">Fleet Score</span></>
                      }
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Title + KPIs */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 tracking-tight leading-tight">Endpoint Intelligence</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Unified fleet visibility · NinjaOne RMM + Wazuh SIEM</p>
                </div>
                <RefreshButton onClick={handleRefresh} loading={refreshing} />
              </div>

              {/* Inline KPI stat strip */}
              <div className="flex flex-wrap gap-0">
                {([
                  { label: "Total Endpoints",  value: stats.total,         color: "text-slate-100",  f: "all"            },
                  { label: "Healthy",          value: stats.barHealthy,    color: "text-green-400",  f: "all"            },
                  { label: "Critical",         value: stats.barCritical,   color: "text-red-400",    f: "critical"       },
                  { label: "Offline + Alerts", value: stats.offlineAlerts, color: "text-orange-400", f: "offline_alerts" },
                  { label: "No SIEM",          value: stats.noWazuh,       color: "text-yellow-400", f: "no_wazuh"       },
                  { label: "Not in RMM",       value: stats.rogue,         color: "text-purple-400", f: "rogue"          },
                ] as { label: string; value: number; color: string; f: FilterMode }[]).map(({ label, value, color, f }, i, arr) => (
                  <button
                    key={label}
                    onClick={() => { setFilter(f); setSelectedDevice(null); }}
                    className={`flex flex-col gap-0.5 text-left px-4 py-1.5 rounded-lg transition-all hover:bg-surface-700/50 ${
                      i < arr.length - 1 ? "border-r border-surface-600" : ""
                    } ${filter === f && f !== "all" ? "bg-surface-700/50 ring-1 ring-surface-500" : ""}`}
                  >
                    <span className={`text-2xl font-bold tabular-nums leading-tight ${color}`}>
                      {loading ? <span className="skeleton inline-block w-8 h-7 rounded align-middle" /> : value}
                    </span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Coverage bar */}
          {!loading && stats.total > 0 && (
            <div className="border-t border-surface-700/60 pt-5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mb-3">
                Fleet Coverage — click a segment to filter
              </span>
              <CoverageBar
                segments={BAR_SEGMENTS}
                total={stats.total}
                onSegmentClick={(f) => { setFilter(f); setSelectedDevice(null); }}
              />
            </div>
          )}

          {/* Controls: filter pills + view toggle + time window */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-700/60 pt-4">
            <div className="flex gap-1 flex-wrap items-center">
              {(["all","no_wazuh","rogue","critical","offline_alerts"] as FilterMode[]).map(k => (
                <button key={k} onClick={() => { setFilter(k); setSelectedDevice(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === k ? "bg-accent/15 text-accent border border-accent/25" : "text-slate-400 hover:text-slate-200 hover:bg-surface-700"
                  }`}>
                  {{ all:"All", no_wazuh:"No Coverage", rogue:"Not in RMM", critical:"Critical", offline_alerts:"Offline+Alerts" }[k]}
                </button>
              ))}
              <div className="ml-2 flex rounded-lg border border-surface-600 overflow-hidden">
                <button onClick={() => setViewMode("cards")}
                  className={`px-2.5 py-1.5 transition-colors ${viewMode === "cards" ? "bg-surface-600 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}
                  title="Card view">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button onClick={() => { setViewMode("table"); setSelectedDevice(null); }}
                  className={`px-2.5 py-1.5 transition-colors border-l border-surface-600 ${viewMode === "table" ? "bg-surface-600 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}
                  title="Table view">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Window:</span>
              <div className="flex gap-1">
                {([1,3,6,12,24] as const).map(h => (
                  <button key={h} onClick={() => setHoursBack(h)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${hoursBack === h ? "bg-accent/20 text-accent border border-accent/30" : "text-slate-400 hover:text-slate-200"}`}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Search + Filters card ── */}
      <div className="card py-3">
        <div className="flex flex-wrap items-center gap-2">

          {/* Search with icon */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Hostname or IP address…"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedDevice(null); }}
              className="bg-surface-700 border border-surface-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-accent w-56"
            />
          </div>

          {/* OS filter */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <select
              value={osFilter}
              onChange={e => { setOsFilter(e.target.value); setSelectedDevice(null); }}
              className="bg-surface-700 border border-surface-600 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent appearance-none cursor-pointer"
            >
              <option value="all">All OS</option>
              {filterOptions.os.map(o => (
                <option key={o.key} value={o.key}>{o.label} ({o.count})</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Device type filter */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setSelectedDevice(null); }}
              className="bg-surface-700 border border-surface-600 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent appearance-none cursor-pointer"
            >
              <option value="all">All Types</option>
              {filterOptions.types.map(t => (
                <option key={t.key} value={t.key}>{t.label} ({t.count})</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Active filter chips */}
          {osFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/10 border border-accent/25 text-xs text-accent">
              {filterOptions.os.find(o => o.key === osFilter)?.label ?? osFilter}
              <button onClick={() => { setOsFilter("all"); setSelectedDevice(null); }} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {typeFilter !== "all" && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/10 border border-accent/25 text-xs text-accent">
              {filterOptions.types.find(t => t.key === typeFilter)?.label ?? typeFilter}
              <button onClick={() => { setTypeFilter("all"); setSelectedDevice(null); }} className="hover:text-white ml-0.5">×</button>
            </span>
          )}

          {/* Clear all */}
          {(search || osFilter !== "all" || typeFilter !== "all") && (
            <button
              onClick={() => { setSearch(""); setOsFilter("all"); setTypeFilter("all"); setSelectedDevice(null); }}
              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-surface-600 hover:border-slate-500 transition-colors"
            >
              Clear all
            </button>
          )}

          {/* Errors */}
          {Object.values(errors).some(Boolean) && (
            <div className="flex gap-3 text-xs text-red-400">
              {errors.ninja   && <span>RMM: {errors.ninja}</span>}
              {errors.wazuh   && <span>SIEM: {errors.wazuh}</span>}
              {errors.summary && <span>Alerts: {errors.summary}</span>}
            </div>
          )}

          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            {filtered.length} endpoint{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Card view ── */}
      {viewMode === "cards" && (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-slate-500 text-sm text-center py-12">No endpoints match current filters</div>
        ) : filter === "all" ? (
          // Grouped view
          <div>
            {(["critical","offlineAlerts","noSIEM","rogue","healthy"] as RiskCat[]).map(cat => (
              <DeviceGroup
                key={cat} cat={cat}
                devices={groups.get(cat) ?? []}
                selectedKey={selectedDevice?.key ?? null}
                hoursBack={hoursBack}
                onSelect={handleSelectDevice}
              />
            ))}
          </div>
        ) : (
          // Flat filtered view
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(d => (
              <DeviceCard key={d.key} device={d}
                selected={selectedDevice?.key === d.key}
                hoursBack={hoursBack}
                onSelect={() => handleSelectDevice(selectedDevice?.key === d.key ? null : d)}
              />
            ))}
          </div>
        )
      )}

      {/* ── Table view ── */}
      {viewMode === "table" && (
        <div className="card">
          {loading ? (
            <div className="space-y-1.5">{Array.from({length:8}).map((_,i)=><div key={i} className="skeleton h-11 rounded"/>)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-10">No endpoints match current filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-600">
                    <th className="w-8 py-2 px-3" />
                    <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Hostname</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">OS</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Last Seen</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Wazuh</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">C · H · M · L</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Latest Alert</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => <TableRow key={d.key} device={d} hoursBack={hoursBack} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
