import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  api, Summary, WazuhAlert, AlertBucket,
  NinjaDevice, PatchSummary, AgentAlertSummary,
} from "../../api/client";

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
          { v: b.low,      fill: "#475569" },
          { v: b.medium,   fill: "#ca8a04" },
          { v: b.high,     fill: "#ea580c" },
          { v: b.critical, fill: "#dc2626" },
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
    ? "#334155"
    : score >= 80 ? "#4ade80"
    : score >= 60 ? "#facc15"
    : score >= 40 ? "#fb923c"
    : "#f87171";

  return (
    <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
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
}

export default function HomeTab({ summary, summaryError, onNavigate }: HomeTabProps) {
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
          className="card text-left hover:border-red-500/30 hover:bg-surface-700/20 transition-all group flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
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
                { label: "Critical", color: "bg-red-500" },
                { label: "High",     color: "bg-orange-500" },
                { label: "Medium",   color: "bg-yellow-600" },
                { label: "Low",      color: "bg-slate-500" },
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
          className="card text-left hover:border-green-500/30 hover:bg-surface-700/20 transition-all group flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
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
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
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
                  <span className="inline-flex w-2 h-2 rounded-full bg-red-500 shrink-0" />
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

      {/* ── Quick navigation cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          {
            tab: "endpoint",
            title: "Endpoint Intelligence",
            desc: "Correlated fleet view with risk categories, device detail, and coverage gaps",
            icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
            accent: "from-accent/10 to-transparent border-accent/20 hover:border-accent/40",
            iconBg: "bg-accent/10 border-accent/20",
            iconColor: "text-accent",
            textColor: "text-accent",
          },
          {
            tab: "wazuh",
            title: "Wazuh SIEM",
            desc: "Drill into alerts, noisy rules, agent health, and alert volume trends",
            icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
            accent: "from-red-500/8 to-transparent border-red-500/20 hover:border-red-500/35",
            iconBg: "bg-red-500/10 border-red-500/20",
            iconColor: "text-red-400",
            textColor: "text-red-400",
          },
          {
            tab: "ninja",
            title: "NinjaOne RMM",
            desc: "Device inventory, patch status, activity feed, and remote management",
            icon: "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3",
            accent: "from-green-500/8 to-transparent border-green-500/20 hover:border-green-500/35",
            iconBg: "bg-green-500/10 border-green-500/20",
            iconColor: "text-green-400",
            textColor: "text-green-400",
          },
        ] as const).map(({ tab, title, desc, icon, accent, iconBg, iconColor, textColor }) => (
          <button
            key={tab}
            onClick={() => onNavigate(tab)}
            className={`text-left p-5 rounded-xl border bg-gradient-to-br ${accent} bg-surface-800 transition-all group`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className={`p-2 rounded-lg border ${iconBg}`}>
                <svg className={`w-4 h-4 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
              </div>
              <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
            <p className={`text-sm font-semibold mb-1 ${textColor}`}>{title}</p>
            <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
          </button>
        ))}
      </div>

    </div>
  );
}
