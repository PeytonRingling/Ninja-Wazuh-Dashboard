import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import {
  api, Summary, WazuhAlert, AlertBucket,
  NinjaDevice, PatchSummary, PatchDetail, AgentAlertSummary,
} from "../../api/client";
import { RuleDetailDrawer } from "../wazuh/NoisyRules";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAgo(ts: string | number | undefined): string {
  if (!ts) return "—";
  try {
    const d = typeof ts === "number" ? new Date(ts * 1000) : parseISO(ts as string);
    if (isNaN(d.getTime())) return String(ts);
    return formatDistanceToNow(d, { addSuffix: true });
  } catch { return String(ts); }
}

// ── Mini stacked bar sparkline ────────────────────────────────────────────────

function Sparkline({ buckets, loading }: { buckets: AlertBucket[] | null; loading: boolean }) {
  if (loading) return <div className="skeleton h-14 rounded-lg w-full" />;
  if (!buckets?.length) return (
    <div className="h-14 flex items-center justify-center text-xs text-slate-600">No data</div>
  );

  const max = Math.max(...buckets.map(b => b.critical + b.high + b.medium + b.low), 1);
  const H = 48;
  const W = buckets.length * 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
      {buckets.map((b, i) => {
        const parts: { v: number; fill: string }[] = [
          { v: b.low,      fill: "#34d399" },
          { v: b.medium,   fill: "#fbbf24" },
          { v: b.high,     fill: "#ff6b35" },
          { v: b.critical, fill: "#ff2d6d" },
        ];
        let y = H;
        return parts.map(({ v, fill }) => {
          if (!v) return null;
          const h = Math.max((v / max) * H, 1);
          y -= h;
          const ySnap = y;
          return (
            <rect key={`${i}-${fill}`} x={i * 4} y={ySnap} width={3.5} height={h} fill={fill} rx={0.5} opacity={0.85} />
          );
        });
      })}
    </svg>
  );
}

// ── Small fleet score ring ────────────────────────────────────────────────────

function ScoreRing({ score, loading }: { score: number | null; loading: boolean }) {
  const r = 36, circ = 2 * Math.PI * r;
  const ringColor = loading || score === null
    ? "#3d3b6a"
    : score >= 80 ? "#34d399"
    : score >= 60 ? "#fbbf24"
    : score >= 40 ? "#ff6b35"
    : "#ff2d6d";

  return (
    <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#2d2b55" strokeWidth="7" />
        {!loading && score !== null && (
          <circle cx="48" cy="48" r={r} fill="none" stroke={ringColor} strokeWidth="7"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={circ * (1 - score / 100)}
            style={{ transition: "stroke-dashoffset 1s ease, stroke 0.5s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {loading || score === null
          ? <div className="skeleton w-10 h-7 rounded" />
          : <>
              <span className="text-xl font-bold tabular-nums leading-none" style={{ color: ringColor }}>{score}</span>
              <span className="text-[10px] text-slate-500 mt-0.5">% healthy</span>
            </>
        }
      </div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ label, status }: { label: string; status: "ok" | "warn" | "error" | "loading" }) {
  const cfg = {
    ok:      { dot: "bg-green-400 shadow-[0_0_5px_#4ade80]", text: "text-green-400",  border: "border-green-500/20",  bg: "bg-green-500/10"  },
    warn:    { dot: "bg-yellow-400",                          text: "text-yellow-400", border: "border-yellow-500/20", bg: "bg-yellow-500/10" },
    error:   { dot: "bg-red-400",                             text: "text-red-400",    border: "border-red-500/20",    bg: "bg-red-500/10"    },
    loading: { dot: "bg-slate-500",                           text: "text-slate-400",  border: "border-surface-600",   bg: "bg-surface-700/40"},
  }[status];
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {label}
    </div>
  );
}

// ── Stat row item ─────────────────────────────────────────────────────────────

function StatRow({ label, value, color, loading }: { label: string; value: number | null; color: string; loading: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold tabular-nums ${color}`}>
        {loading || value === null
          ? <span className="skeleton inline-block w-5 h-3.5 rounded" />
          : value}
      </span>
    </div>
  );
}

// ── Arrow icon ────────────────────────────────────────────────────────────────

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-slate-600 group-hover:text-accent transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface HomeTabProps {
  summary: Summary | null;
  summaryError: string | null;
  onNavigate: (tab: string) => void;
  onNavigateToWazuh?: (agentName: string) => void;
  onNavigateToPatch?: (deviceId: number) => void;
}

export default function HomeTab({ summary, summaryError, onNavigate, onNavigateToWazuh, onNavigateToPatch }: HomeTabProps) {
  const [recentAlerts, setRecentAlerts] = useState<WazuhAlert[] | null>(null);
  const [alertVolume,  setAlertVolume]  = useState<AlertBucket[] | null>(null);
  const [ninjaDevices, setNinjaDevices] = useState<NinjaDevice[] | null>(null);
  const [ninjaPatches, setNinjaPatches] = useState<PatchSummary | null>(null);
  const [agentSummary, setAgentSummary] = useState<AgentAlertSummary[] | null>(null);
  const [dataLoading,  setDataLoading]  = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.wazuhAlerts({ severity: "critical", limit: 5, hours_back: 24 }),
      api.wazuhAlertVolume("24h"),
      api.ninjaDevices(),
      api.ninjaPatches(),
      api.wazuhAgentAlertSummary(24),
    ]).then(([alerts, volume, devices, patches, agSum]) => {
      if (alerts.status   === "fulfilled") setRecentAlerts(alerts.value.alerts);
      if (volume.status   === "fulfilled") setAlertVolume(volume.value);
      if (devices.status  === "fulfilled") setNinjaDevices(devices.value);
      if (patches.status  === "fulfilled") setNinjaPatches(patches.value);
      if (agSum.status    === "fulfilled") setAgentSummary(agSum.value);
      setDataLoading(false);
    });
  }, []);

  // Fleet score: % of monitored agents with no critical or high alerts
  const fleetScore = useMemo(() => {
    if (!agentSummary?.length) return null;
    const healthy = agentSummary.filter(a => a.critical === 0 && a.high === 0).length;
    return Math.round((healthy / agentSummary.length) * 100);
  }, [agentSummary]);

  const ninjaOnline  = useMemo(() => ninjaDevices?.filter(d => !d.offline).length  ?? null, [ninjaDevices]);
  const ninjaOffline = useMemo(() => ninjaDevices?.filter(d =>  d.offline).length  ?? null, [ninjaDevices]);
  const onlinePct    = useMemo(() => {
    if (!ninjaDevices?.length || ninjaOnline === null) return 0;
    return (ninjaOnline / ninjaDevices.length) * 100;
  }, [ninjaDevices, ninjaOnline]);
  const patchPct = useMemo(() => {
    if (!ninjaPatches) return 0;
    return (ninjaPatches.fully_patched / ninjaPatches.total_devices) * 100;
  }, [ninjaPatches]);

  const wazuh    = summary?.wazuh;
  const wazuhErr = !!summary?.wazuh_error || !!summaryError;
  const ninjaErr = !!summary?.ninja_error;

  const wazuhStatus  = wazuhErr ? "error" : !wazuh ? "loading" : wazuh.critical > 0 ? "warn" : "ok";
  const ninjaStatus  = ninjaErr ? "error" : !ninjaDevices ? "loading" : ninjaErr ? "error" : "ok";
  const fleetStatus  = fleetScore === null ? "loading" : fleetScore >= 80 ? "ok" : fleetScore >= 60 ? "warn" : "error";

  const criticalAgents  = agentSummary?.filter(a => a.critical > 0).length ?? null;
  const highOnlyAgents  = agentSummary?.filter(a => a.high > 0 && a.critical === 0).length ?? null;
  const cleanAgents     = agentSummary?.filter(a => a.critical === 0 && a.high === 0).length ?? null;

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* ── Hero header ── */}
      <div className="relative rounded-2xl overflow-hidden border border-surface-600 bg-surface-800">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.10] via-transparent to-purple-600/[0.06] pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-accent/[0.07] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-56 h-40 rounded-full bg-purple-500/[0.04] blur-3xl pointer-events-none" />

        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            {/* Title block */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/25">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-100 tracking-tight leading-tight">IT Operations Dashboard</h1>
                  <p className="text-sm text-slate-400 mt-0.5">Real-time visibility across your endpoint fleet and security events</p>
                </div>
              </div>
            </div>

            {/* Live status pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill label="Wazuh SIEM"   status={wazuhStatus} />
              <StatusPill label="NinjaOne RMM" status={ninjaStatus} />
              <StatusPill label={fleetScore !== null ? `Fleet ${fleetScore}% Healthy` : "Fleet"} status={fleetStatus} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Three system panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Wazuh SIEM ── */}
        <button onClick={() => onNavigate("wazuh")}
          className="card text-left hover:border-accent/30 hover:bg-surface-700/20 transition-all group flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200 leading-tight">Wazuh SIEM</p>
                <p className="text-[11px] text-slate-500">Security event monitoring</p>
              </div>
            </div>
            <ArrowIcon />
          </div>

          {/* Alert volume sparkline */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">24h Alert Volume</p>
            <Sparkline buckets={alertVolume} loading={dataLoading} />
            <div className="flex gap-3 mt-1.5 flex-wrap">
              {[
                { label: "Critical", color: "bg-[#ff2d6d]" },
                { label: "High",     color: "bg-[#ff6b35]" },
                { label: "Medium",   color: "bg-[#fbbf24]" },
                { label: "Low",      color: "bg-[#34d399]" },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${color}`} />
                  <span className="text-[10px] text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Severity breakdown */}
          <div className="grid grid-cols-2 gap-2 mt-auto">
            {([
              { label: "Critical", value: wazuh?.critical ?? null, color: "text-red-400",    bg: "bg-red-500/8",     border: "border-red-500/20"    },
              { label: "High",     value: wazuh?.high     ?? null, color: "text-orange-400", bg: "bg-orange-500/8",  border: "border-orange-500/20" },
              { label: "Medium",   value: wazuh?.medium   ?? null, color: "text-yellow-400", bg: "bg-yellow-500/8",  border: "border-yellow-500/20" },
              { label: "Low",      value: wazuh?.low      ?? null, color: "text-slate-400",  bg: "bg-surface-700/40",border: "border-surface-600"   },
            ] as { label: string; value: number | null; color: string; bg: string; border: string }[]).map(({ label, value, color, bg, border }) => (
              <div key={label} className={`flex items-center justify-between px-3 py-2 rounded-lg ${bg} border ${border}`}>
                <span className="text-[11px] text-slate-400">{label}</span>
                <span className={`text-sm font-bold tabular-nums ${color}`}>
                  {dataLoading && value === null
                    ? <span className="skeleton inline-block w-6 h-4 rounded" />
                    : (value ?? "—")}
                </span>
              </div>
            ))}
          </div>

          {wazuh && (
            <p className="text-[11px] text-slate-600 mt-3 text-right">{wazuh.total} events in last 24h</p>
          )}
        </button>

        {/* ── NinjaOne RMM ── */}
        <button onClick={() => onNavigate("ninja")}
          className="card text-left hover:border-accent/30 hover:bg-surface-700/20 transition-all group flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200 leading-tight">NinjaOne RMM</p>
                <p className="text-[11px] text-slate-500">Remote monitoring & management</p>
              </div>
            </div>
            <ArrowIcon />
          </div>

          {/* Online / Offline */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Device Connectivity</p>
            {dataLoading ? (
              <div className="skeleton h-3 rounded-full w-full mb-2" />
            ) : (
              <>
                <div className="h-3 rounded-full bg-surface-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-700"
                    style={{ width: `${onlinePct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-xs">
                  <span className="text-green-400 font-medium">{ninjaOnline} online</span>
                  <span className="text-slate-500">{ninjaOffline} offline</span>
                </div>
              </>
            )}
          </div>

          {/* Patch compliance */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">Patch Compliance</p>
            {dataLoading || !ninjaPatches ? (
              <div className="skeleton h-3 rounded-full w-full mb-2" />
            ) : (
              <>
                <div className="h-3 rounded-full bg-surface-700 overflow-hidden flex">
                  <div className="h-full bg-green-500 transition-all duration-700"
                    style={{ width: `${(ninjaPatches.fully_patched  / ninjaPatches.total_devices) * 100}%` }} />
                  <div className="h-full bg-yellow-500 transition-all duration-700"
                    style={{ width: `${(ninjaPatches.patches_pending / ninjaPatches.total_devices) * 100}%` }} />
                  <div className="h-full bg-red-500 transition-all duration-700"
                    style={{ width: `${(ninjaPatches.patches_failed  / ninjaPatches.total_devices) * 100}%` }} />
                </div>
                <div className="flex gap-4 mt-1.5 text-xs flex-wrap">
                  <span className="text-green-400">{ninjaPatches.fully_patched} patched</span>
                  <span className="text-yellow-400">{ninjaPatches.patches_pending} pending</span>
                  <span className="text-red-400">{ninjaPatches.patches_failed} failed</span>
                </div>
              </>
            )}
          </div>

          {ninjaDevices && (
            <p className="text-[11px] text-slate-600 mt-auto text-right">{ninjaDevices.length} total managed devices</p>
          )}
        </button>

        {/* ── Endpoint Intel ── */}
        <button onClick={() => onNavigate("endpoint")}
          className="card text-left hover:border-accent/30 hover:bg-surface-700/20 transition-all group flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200 leading-tight">Endpoint Intel</p>
                <p className="text-[11px] text-slate-500">Correlated RMM + SIEM fleet view</p>
              </div>
            </div>
            <ArrowIcon />
          </div>

          {/* Score ring + agent stats */}
          <div className="flex items-center gap-5 mb-5">
            <ScoreRing score={fleetScore} loading={dataLoading} />
            <div className="flex flex-col gap-2.5 flex-1 min-w-0">
              <StatRow label="Critical alerts" value={criticalAgents}  color="text-red-400"    loading={dataLoading} />
              <StatRow label="High alerts"     value={highOnlyAgents}  color="text-orange-400" loading={dataLoading} />
              <StatRow label="Clean agents"    value={cleanAgents}     color="text-green-400"  loading={dataLoading} />
            </div>
          </div>

          {/* Mini coverage bar */}
          {!dataLoading && agentSummary && (
            <div className="mt-auto">
              <div className="h-2 rounded-full bg-surface-700 overflow-hidden flex gap-0.5">
                {cleanAgents !== null && agentSummary.length > 0 && (
                  <div className="h-full bg-green-500 rounded-full transition-all duration-700"
                    style={{ width: `${(cleanAgents / agentSummary.length) * 100}%` }} />
                )}
                {highOnlyAgents !== null && agentSummary.length > 0 && (
                  <div className="h-full bg-orange-500 transition-all duration-700"
                    style={{ width: `${(highOnlyAgents / agentSummary.length) * 100}%` }} />
                )}
                {criticalAgents !== null && agentSummary.length > 0 && (
                  <div className="h-full bg-red-500 rounded-full transition-all duration-700"
                    style={{ width: `${(criticalAgents / agentSummary.length) * 100}%` }} />
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-2 text-right">{agentSummary.length} monitored agents</p>
            </div>
          )}
        </button>
      </div>

      {/* ── Recent Critical Alerts ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Recent Critical Alerts
            <span className="text-xs text-slate-500 font-normal">— last 24h</span>
          </h3>
          <button
            onClick={() => onNavigate("wazuh")}
            className="text-xs text-accent hover:text-white flex items-center gap-1 transition-colors font-medium"
          >
            View all in Wazuh
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>

        {dataLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        ) : !recentAlerts?.length ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <svg className="w-8 h-8 text-green-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-green-400 font-medium">No critical alerts in the last 24 hours</span>
            <span className="text-xs text-slate-600">Your fleet looks clean</span>
          </div>
        ) : (
          <div className="divide-y divide-surface-700/60">
            {recentAlerts.map(alert => (
              <div key={alert.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 group/row hover:bg-surface-700/20 -mx-5 px-5 transition-colors rounded-lg">
                <div className="flex items-center gap-2.5 shrink-0 w-36 min-w-0">
                  <span className="inline-flex w-1.5 h-1.5 rounded-full bg-red-500/70 shrink-0" />
                  <span className="text-xs font-mono text-slate-300 truncate">{alert.agent?.name ?? "—"}</span>
                </div>
                <p className="flex-1 text-xs text-slate-300 leading-snug min-w-0 truncate">{alert.rule?.description ?? "—"}</p>
                <div className="flex items-center gap-3 shrink-0">
                  {alert.rule?.id && (
                    <span className="text-[10px] font-mono text-slate-600 hidden sm:inline">Rule {alert.rule.id}</span>
                  )}
                  <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                    L{alert.rule?.level}
                  </span>
                  <span className="text-xs text-slate-600 whitespace-nowrap w-20 text-right">{fmtAgo(alert.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Alert Correlation Panel ── */}
      <AlertCorrelation
        agentSummary={agentSummary}
        ninjaDevices={ninjaDevices}
        ninjaPatches={ninjaPatches}
        loading={dataLoading}
        onNavigate={onNavigate}
        onNavigateToWazuh={onNavigateToWazuh}
        onNavigateToPatch={onNavigateToPatch}
      />

    </div>
  );
}

// ── Alert Correlation ─────────────────────────────────────────────────────────

function norm(s: string) { return (s ?? "").toLowerCase().split(".")[0].trim(); }

function levelToSev(level?: number): "critical" | "high" | "medium" | "low" {
  if (!level) return "low";
  if (level >= 12) return "critical";
  if (level >= 8) return "high";
  if (level >= 4) return "medium";
  return "low";
}

const SEV_DOT: Record<string, string> = {
  critical: "#ff2d6d", high: "#ff6b35", medium: "#fbbf24", low: "#34d399",
};

interface CorrelatedDevice {
  agentName: string;
  critical: number;
  high: number;
  total: number;
  ninja: NinjaDevice | null;
  issues: string[];
  patchDetails: PatchDetail[];
  latestDesc: string | null;
}

const SEV_BADGE_CLS: Record<string, string> = {
  critical: "badge-critical", high: "badge-high", medium: "badge-medium", low: "badge-low",
};

const SEV_LABEL: Record<string, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-3.5 rounded-full shrink-0" style={{ background: "linear-gradient(180deg, #7c3aed, #a855f7)" }} />
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{children}</p>
    </div>
  );
}

function CorrelationDrawer({ device, ninjaWebUrl, onClose, onNavigateToWazuh, onNavigateToPatch, onOpenRule }: {
  device: CorrelatedDevice;
  ninjaWebUrl: string | null;
  onClose: () => void;
  onNavigateToWazuh?: (agentName: string) => void;
  onNavigateToPatch?: (deviceId: number) => void;
  onOpenRule?: (rule: { id: string; desc: string; level: number }) => void;
}) {
  const [alerts, setAlerts] = useState<WazuhAlert[] | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState<string | null>(null);
  const [expandedPatches, setExpandedPatches] = useState<"failed" | "pending" | null>(null);

  useEffect(() => {
    setAlertsLoading(true); setAlerts(null); setSevFilter(null); setExpandedPatches(null);
    api.wazuhAlerts({ agent: device.agentName, hours_back: 24, limit: 50 })
      .then(r => setAlerts(r.alerts))
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false));
  }, [device.agentName]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const ip = device.ninja?.ipAddresses?.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a) && !a.startsWith("169."));
  const lastSeen = device.ninja?.lastContact ?? device.ninja?.lastSeenAt;
  const lastSeenFmt = lastSeen
    ? (() => { try { return format(new Date(lastSeen > 1e12 ? lastSeen : lastSeen * 1000), "MMM d, HH:mm"); } catch { return "—"; } })()
    : "—";

  const filteredAlerts = alerts
    ? (sevFilter ? alerts.filter(a => levelToSev(a.rule?.level) === sevFilter) : alerts)
    : null;

  // Severity counts for filter badges
  const sevCounts = alerts ? {
    critical: alerts.filter(a => levelToSev(a.rule?.level) === "critical").length,
    high: alerts.filter(a => levelToSev(a.rule?.level) === "high").length,
    medium: alerts.filter(a => levelToSev(a.rule?.level) === "medium").length,
    low: alerts.filter(a => levelToSev(a.rule?.level) === "low").length,
  } : null;

  const failedPatches = device.patchDetails.filter(p => p.status === "FAILED");
  const pendingPatches = device.patchDetails.filter(p => p.status === "NEEDS_UPDATE");

  const drawer = (
    <>
      <div className="fixed inset-0 bg-black/30 z-[9998]" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 w-[600px] flex flex-col z-[9999]"
        style={{
          background: "linear-gradient(180deg, #1a1a3e 0%, #13132b 100%)",
          borderLeft: "1px solid #2d2b55",
          boxShadow: "-8px 0 48px rgba(0,0,0,0.8), -1px 0 0 rgba(124,58,237,0.25)",
          animation: "slideInRight 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-surface-600">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-sm font-semibold text-slate-200">{device.agentName}</span>
                {/* Clickable severity badges — filter alerts below */}
                {sevCounts && (["critical", "high", "medium", "low"] as const).map(sev =>
                  (sevCounts[sev] > 0) ? (
                    <button
                      key={sev}
                      onClick={() => setSevFilter(f => f === sev ? null : sev)}
                      title={`${sevFilter === sev ? "Clear" : "Filter to"} ${SEV_LABEL[sev]} alerts`}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-all ${SEV_BADGE_CLS[sev]} ${sevFilter === sev ? "ring-2 ring-offset-1 ring-offset-surface-900 ring-current scale-105" : "hover:opacity-80"}`}
                    >
                      {sevCounts[sev]} {SEV_LABEL[sev]}
                    </button>
                  ) : null
                )}
              </div>
              <p className="text-xs text-slate-500">
                {device.total} alerts in the last 24h
                {sevFilter && <span className="text-accent ml-1.5">· showing {SEV_LABEL[sevFilter]} only <button onClick={() => setSevFilter(null)} className="underline hover:text-white ml-0.5 cursor-pointer">clear</button></span>}
              </p>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-700 transition-colors shrink-0 mt-0.5 cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto divide-y divide-surface-800">

          {/* Device Summary */}
          <div className="px-5 py-4">
            <SectionHead>Device Summary</SectionHead>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {device.ninja?.os?.name && (
                <div><span className="text-slate-500">OS</span><p className="text-slate-300 mt-0.5">{device.ninja.os.name}</p></div>
              )}
              {ip && (
                <div><span className="text-slate-500">IP</span><p className="text-slate-300 font-mono mt-0.5">{ip}</p></div>
              )}
              {device.ninja?.nodeClass && (
                <div><span className="text-slate-500">Type</span><p className="text-slate-300 mt-0.5">{device.ninja.nodeClass.replace(/_/g, " ")}</p></div>
              )}
              <div>
                <span className="text-slate-500">NinjaOne Status</span>
                <p className={`mt-0.5 font-medium ${device.ninja?.offline === false ? "text-green-400" : device.ninja?.offline ? "text-slate-500" : "text-slate-600"}`}>
                  {device.ninja === null ? "Not in NinjaOne" : device.ninja.offline ? "Offline" : "Online"}
                </p>
              </div>
              {lastSeen && (
                <div><span className="text-slate-500">Last Seen</span><p className="text-slate-300 mt-0.5">{lastSeenFmt}</p></div>
              )}
              {device.ninja?.system?.manufacturer && (
                <div><span className="text-slate-500">Manufacturer</span><p className="text-slate-300 mt-0.5">{device.ninja.system.manufacturer}</p></div>
              )}
            </div>
            {/* Issue badges — patch failures are clickable */}
            {device.issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {device.ninja?.offline && (
                  <span className="text-[11px] px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25">Device offline in NinjaOne</span>
                )}
                {failedPatches.length > 0 && (
                  <button
                    onClick={() => setExpandedPatches(p => p === "failed" ? null : "failed")}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${expandedPatches === "failed" ? "bg-red-500/20 text-red-300 border-red-500/40 ring-1 ring-red-400/30" : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"}`}
                    title="Click to see patch details"
                  >
                    {failedPatches.length} patch failure{failedPatches.length > 1 ? "s" : ""} ▾
                  </button>
                )}
                {pendingPatches.length > 0 && (
                  <button
                    onClick={() => setExpandedPatches(p => p === "pending" ? null : "pending")}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${expandedPatches === "pending" ? "bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-400/30" : "bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25"}`}
                    title="Click to see pending patches"
                  >
                    {pendingPatches.length} pending{pendingPatches.length > 1 ? "" : " patch"} ▾
                  </button>
                )}
              </div>
            )}
            {/* Expanded patch detail */}
            {expandedPatches && (
              <div className="mt-3 bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700">
                  <span className={`text-[10px] font-semibold uppercase tracking-widest ${expandedPatches === "failed" ? "text-red-400" : "text-amber-400"}`}>
                    {expandedPatches === "failed" ? "Failed Patches" : "Pending Patches"}
                  </span>
                  <div className="flex items-center gap-2">
                    {device.ninja && ninjaWebUrl && (
                      <a
                        href={`${ninjaWebUrl.replace(/\/$/, "")}/devices/${device.ninja.id}/patches`}
                        target="_blank" rel="noreferrer"
                        className="text-[10px] text-accent hover:text-white flex items-center gap-0.5 transition-colors"
                      >
                        Open in NinjaOne
                        <svg className="w-2.5 h-2.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    )}
                    {device.ninja && onNavigateToPatch && (
                      <button
                        onClick={() => { onClose(); onNavigateToPatch(device.ninja!.id); }}
                        className="text-[10px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        View in app →
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-surface-700/50 max-h-52 overflow-y-auto">
                  {(expandedPatches === "failed" ? failedPatches : pendingPatches).map((p, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <p className="text-slate-300 truncate font-medium" title={p.name}>{p.name ?? "—"}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {p.identifier && <span className="font-mono text-accent text-[10px]">{p.identifier}</span>}
                        {p.severity && <span className={`text-[10px] font-semibold ${p.severity === "CRITICAL" ? "text-red-400" : p.severity === "IMPORTANT" ? "text-orange-400" : "text-slate-400"}`}>{p.severity}</span>}
                        {p.type && <span className="text-[10px] text-slate-500">{p.type}</span>}
                        {p.installedAt && <span className="text-[10px] text-slate-600 ml-auto">{(() => { try { return format(parseISO(p.installedAt!), "MMM d"); } catch { return p.installedAt; } })()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active Alerts */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHead>
                Active Alerts (24h)
                {sevFilter && <span className="text-accent normal-case ml-1">— {SEV_LABEL[sevFilter]}</span>}
              </SectionHead>
              {alerts && <span className="text-[10px] text-slate-600">{filteredAlerts?.length ?? 0} / {alerts.length}</span>}
            </div>

            {alertsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
              </div>
            ) : !filteredAlerts?.length ? (
              <p className="text-xs text-slate-600 py-4 text-center">
                {sevFilter ? `No ${SEV_LABEL[sevFilter]} alerts for this agent` : "No alerts found for this agent"}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filteredAlerts.map(alert => {
                  const sev = levelToSev(alert.rule?.level);
                  const dot = SEV_DOT[sev];
                  return (
                    <button
                      key={alert.id}
                      onClick={() => alert.rule?.id && onOpenRule?.({ id: alert.rule.id, desc: alert.rule.description ?? "", level: alert.rule.level ?? 0 })}
                      disabled={!alert.rule?.id}
                      className={`w-full text-left bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 transition-all ${alert.rule?.id ? "cursor-pointer hover:bg-surface-700 hover:border-surface-600 hover:shadow-lg group" : ""}`}
                      title={alert.rule?.id ? "Click to view rule details" : undefined}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
                        {alert.rule?.id && (
                          <span className="font-mono text-[10px] text-accent group-hover:text-white transition-colors">Rule {alert.rule.id}</span>
                        )}
                        <span className="text-[10px] font-medium ml-auto" style={{ color: dot }}>L{alert.rule?.level}</span>
                        <span className="text-[10px] text-slate-600">
                          {alert.timestamp ? (() => { try { return format(parseISO(alert.timestamp), "MMM d HH:mm"); } catch { return "—"; } })() : "—"}
                        </span>
                        {alert.rule?.id && (
                          <svg className="w-3 h-3 text-slate-700 group-hover:text-accent transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">{alert.rule?.description ?? "—"}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="px-5 py-4">
            <SectionHead>Quick Actions</SectionHead>
            <div className="flex flex-col gap-2">
              {ninjaWebUrl && device.ninja && (
                <button
                  onClick={() => window.open(`${ninjaWebUrl.replace(/\/$/, "")}/devices?search=${encodeURIComponent(device.agentName)}`, "_blank")}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium border border-surface-600 bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white transition-colors text-left cursor-pointer"
                >
                  <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                  </svg>
                  View device in NinjaOne
                  <svg className="w-3 h-3 ml-auto text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => { onClose(); onNavigateToWazuh?.(device.agentName); }}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium border border-accent/30 text-accent hover:text-white transition-all text-left cursor-pointer"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.14), rgba(168,85,247,0.08))" }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                View all Wazuh alerts for this device
              </button>
              {device.ninja && onNavigateToPatch && device.patchDetails.length > 0 && (
                <button
                  onClick={() => { onClose(); onNavigateToPatch(device.ninja!.id); }}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium border border-surface-600 bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white transition-colors text-left cursor-pointer"
                >
                  <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  View patch compliance in NinjaOne tab
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

    </>
  );

  return createPortal(drawer, document.body);
}

function AlertCorrelation({ agentSummary, ninjaDevices, ninjaPatches, loading, onNavigate, onNavigateToWazuh, onNavigateToPatch }: {
  agentSummary: AgentAlertSummary[] | null;
  ninjaDevices: NinjaDevice[] | null;
  ninjaPatches: PatchSummary | null;
  loading: boolean;
  onNavigate: (tab: string) => void;
  onNavigateToWazuh?: (agentName: string) => void;
  onNavigateToPatch?: (deviceId: number) => void;
}) {
  const [selected, setSelected] = useState<CorrelatedDevice | null>(null);
  const [ninjaWebUrl, setNinjaWebUrl] = useState<string | null>(null);
  const [ruleDrawerId, setRuleDrawerId] = useState<{ id: string; desc: string; level: number } | null>(null);

  useEffect(() => {
    api.config().then(c => setNinjaWebUrl(c.ninja_web_url || null)).catch(() => {});
  }, []);

  // Close rule drawer when device drawer closes
  const handleClose = useCallback(() => { setSelected(null); setRuleDrawerId(null); }, []);
  const handleCardClick = useCallback((c: CorrelatedDevice) => { setRuleDrawerId(null); setSelected(c); }, []);

  const correlated = useMemo<CorrelatedDevice[]>(() => {
    if (!agentSummary || !ninjaDevices) return [];
    return agentSummary
      .filter(a => a.critical > 0 || a.high > 0)
      .map(a => {
        const ninja = ninjaDevices.find(d =>
          norm(d.systemName ?? "") === norm(a.agent_name) ||
          norm(d.displayName ?? "") === norm(a.agent_name)
        ) ?? null;
        const issues: string[] = [];
        if (ninja?.offline) issues.push("Device offline in NinjaOne");
        const patchDetails = ninja && ninjaPatches
          ? ninjaPatches.patch_details.filter(p => p.deviceId === ninja.id && (p.status === "FAILED" || p.status === "NEEDS_UPDATE"))
          : [];
        if (patchDetails.length > 0) {
          const failed = patchDetails.filter(p => p.status === "FAILED").length;
          if (failed > 0) issues.push(`${failed} patch failure${failed > 1 ? "s" : ""}`);
        }
        return {
          agentName: a.agent_name,
          critical: a.critical,
          high: a.high,
          total: a.total,
          ninja,
          issues,
          patchDetails,
          latestDesc: a.latest?.description ?? null,
        };
      })
      .sort((a, b) => b.critical - a.critical || b.high - a.high)
      .slice(0, 12);
  }, [agentSummary, ninjaDevices, ninjaPatches]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Alert Correlation — Needs Attention
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Devices with active Wazuh alerts, cross-referenced with NinjaOne status</p>
        </div>
        <button onClick={() => onNavigate("wazuh")}
          className="text-xs text-accent hover:text-white flex items-center gap-1 transition-colors font-medium">
          View all in Wazuh
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : correlated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <svg className="w-8 h-8 text-green-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-green-400 font-medium">No devices need attention</p>
          <p className="text-xs text-slate-600">No critical or high alerts in the past 24 hours</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {correlated.map(c => {
            const hasBothSystems = !!c.ninja;
            const borderColor = c.critical > 0 ? "rgba(255,61,90,0.4)" : "rgba(255,124,42,0.35)";
            const glowColor = c.critical > 0 ? "rgba(255,61,90,0.08)" : "rgba(255,124,42,0.06)";
            return (
              <button
                key={c.agentName}
                onClick={() => handleCardClick(c)}
                className="text-left rounded-xl p-3.5 border transition-all hover:scale-[1.01] cursor-pointer"
                style={{ border: `1px solid ${borderColor}`, background: `linear-gradient(135deg, ${glowColor}, transparent)` }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate font-mono">{c.agentName}</p>
                    {c.ninja && (
                      <p className="text-[10px] text-slate-500 truncate">{c.ninja.os?.name ?? c.ninja.nodeClass ?? "—"}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {c.critical > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded badge-critical">{c.critical} Crit</span>
                    )}
                    {c.high > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded badge-high">{c.high} High</span>
                    )}
                  </div>
                </div>
                {c.latestDesc && (
                  <p className="text-[11px] text-slate-400 leading-snug truncate mb-2">{c.latestDesc}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {!hasBothSystems && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-500 border border-slate-600">Not in NinjaOne</span>
                  )}
                  {c.issues.map(iss => (
                    <span key={iss} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">{iss}</span>
                  ))}
                  {hasBothSystems && c.issues.length === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-slate-500">NinjaOne OK</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <CorrelationDrawer
          device={selected}
          ninjaWebUrl={ninjaWebUrl}
          onClose={handleClose}
          onNavigateToWazuh={onNavigateToWazuh}
          onNavigateToPatch={onNavigateToPatch}
          onOpenRule={setRuleDrawerId}
        />
      )}

      {/* Rule detail drawer rendered as a separate portal — z-index above correlation drawer */}
      {ruleDrawerId && (
        <RuleDetailDrawer
          ruleId={ruleDrawerId.id}
          description={ruleDrawerId.desc}
          level={ruleDrawerId.level}
          zBase={10000}
          onClose={() => setRuleDrawerId(null)}
        />
      )}
    </div>
  );
}
