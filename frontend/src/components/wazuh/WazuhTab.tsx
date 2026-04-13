import { useState, useEffect, useCallback } from "react";
import { api, AlertsResponse, AlertBucket, NoisyRule, WazuhAgent, WazuhSummary } from "../../api/client";
import AlertVolumeChart from "./AlertVolumeChart";
import NoisyRules from "./NoisyRules";
import SeverityDonut from "./SeverityDonut";
import AlertTable from "./AlertTable";
import AgentStatus from "./AgentStatus";
import RuleChangeLog from "./RuleChangeLog";
import ErrorState from "../ErrorState";
import RefreshButton from "../RefreshButton";

interface NavOptions { subTab?: string; agentName?: string; ruleId?: string; }

interface Props {
  hasError: boolean;
  errorMsg?: string;
  wazuhSummary: WazuhSummary | null;
  severityFilter: string;
  onSeverityChange: (s: string) => void;
  navOptions?: NavOptions;
  onNavConsumed?: () => void;
}

type SubTab = "overview" | "alerts" | "rules" | "agents" | "change_log";

const HOUR_OPTIONS = [1, 3, 6, 12, 24] as const;

const SEV_BADGE: Record<string, string> = {
  critical: "badge-critical",
  high:     "badge-high",
  medium:   "badge-medium",
  low:      "badge-low",
};

export default function WazuhTab({ hasError, errorMsg, wazuhSummary, severityFilter, onSeverityChange, navOptions, onNavConsumed }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("overview");

  // Consume nav options from global search
  useEffect(() => {
    if (navOptions?.subTab) {
      setSubTab(navOptions.subTab as SubTab);
      if (navOptions.agentName) setAlertPage(0);
      onNavConsumed?.();
    }
  }, [navOptions, onNavConsumed]);
  const [hoursBack, setHoursBack] = useState<number>(24);

  const [volume, setVolume] = useState<AlertBucket[] | null>(null);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState("24h");

  const [rules, setRules] = useState<NoisyRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertPage, setAlertPage] = useState(0);
  const [alertRuleId, setAlertRuleId] = useState("");

  const [agents, setAgents] = useState<WazuhAgent[] | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 50;

  const loadVolume = useCallback(async (tf: string) => {
    setVolumeError(null);
    try { setVolume(await api.wazuhAlertVolume(tf)); }
    catch (e) { setVolumeError(e instanceof Error ? e.message : "Failed"); }
  }, []);

  const loadRules = useCallback(async () => {
    setRulesError(null);
    try { setRules(await api.wazuhNoisyRules(hoursBack)); }
    catch (e) { setRulesError(e instanceof Error ? e.message : "Failed"); }
  }, [hoursBack]);

  const loadAlerts = useCallback(async () => {
    setAlertsError(null);
    try {
      setAlerts(await api.wazuhAlerts({
        limit: PAGE_SIZE,
        offset: alertPage * PAGE_SIZE,
        severity: severityFilter || undefined,
        rule_id: alertRuleId || undefined,
        hours_back: hoursBack,
      }));
    } catch (e) { setAlertsError(e instanceof Error ? e.message : "Failed"); }
  }, [alertPage, severityFilter, alertRuleId, hoursBack]);

  const loadAgents = useCallback(async () => {
    setAgentsError(null);
    try { setAgents(await api.wazuhAgents()); }
    catch (e) { setAgentsError(e instanceof Error ? e.message : "Failed"); }
  }, []);

  const loadAll = useCallback(() => {
    loadVolume(timeframe);
    loadRules();
    loadAlerts();
    loadAgents();
  }, [loadVolume, timeframe, loadRules, loadAlerts, loadAgents]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => clearInterval(id);
  }, [loadAll]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useEffect(() => { loadVolume(timeframe); }, [loadVolume, timeframe]);

  // When a severity is pushed from the top bar, jump to the Alerts sub-tab
  useEffect(() => {
    if (severityFilter) {
      setSubTab("alerts");
      setAlertPage(0);
    }
  }, [severityFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await api.refreshWazuh().catch(() => {});
    loadAll();
    setTimeout(() => setRefreshing(false), 800);
  };

  if (hasError) return <ErrorState title="Wazuh SIEM Unavailable" message={errorMsg} />;

  const SUB_TABS: { key: SubTab; label: string; icon: string; count?: number | null }[] = [
    {
      key: "overview", label: "Overview",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      key: "alerts", label: "Alerts",
      icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
      count: alerts?.total,
    },
    {
      key: "rules", label: "Top Rules",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      count: rules?.length,
    },
    {
      key: "agents", label: "Agents",
      icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2",
      count: agents?.length,
    },
    {
      key: "change_log", label: "Change Log",
      icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
    },
  ];

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      {/* ── Summary card + sub-tab nav ── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Severity counts */}
          <div className="flex flex-wrap items-center gap-3">
            {wazuhSummary ? (
              <>
                {(["critical", "high", "medium", "low"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => { onSeverityChange(sev === severityFilter ? "" : sev); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-opacity hover:opacity-80 active:scale-95 ${SEV_BADGE[sev]} ${severityFilter === sev ? "ring-2 ring-offset-1 ring-offset-surface-800 ring-current" : ""}`}
                  >
                    <span className="text-xs opacity-70 capitalize">{sev === "critical" ? "Crit" : sev === "medium" ? "Med" : sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
                    <span className="font-bold tabular-nums">{wazuhSummary[sev].toLocaleString()}</span>
                  </button>
                ))}
              </>
            ) : (
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8 w-16 rounded-lg" />)}
              </div>
            )}
          </div>

          {/* Window + Refresh */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Window:</span>
            <div className="flex gap-1">
              {HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => { setHoursBack(h); setAlertPage(0); onSeverityChange(""); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    hoursBack === h
                      ? "bg-accent/20 text-accent border border-accent/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
            <RefreshButton onClick={handleRefresh} loading={refreshing} />
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex gap-1 mt-4 border-t border-surface-600 pt-3">
          {SUB_TABS.map(({ key, label, icon, count }) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                subTab === key
                  ? "bg-accent/15 text-accent border border-accent/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-surface-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              {label}
              {count != null && (
                <span className="text-xs font-semibold tabular-nums text-slate-500">
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sub-tab content ── */}
      {subTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AlertVolumeChart
              data={volume}
              error={volumeError}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />
          </div>
          <div>
            <SeverityDonut
              data={volume}
              onSeveritySelect={(sev) => {
                onSeverityChange(sev === severityFilter ? "" : sev);
                setAlertPage(0);
              }}
              selectedSeverity={severityFilter}
            />
          </div>
        </div>
      )}

      {subTab === "alerts" && (
        <AlertTable
          data={alerts}
          error={alertsError}
          page={alertPage}
          pageSize={PAGE_SIZE}
          onPageChange={setAlertPage}
          hoursBack={hoursBack}
          severity={severityFilter}
          onSeverityChange={(s) => { onSeverityChange(s); setAlertPage(0); }}
          ruleId={alertRuleId}
          onRuleIdChange={(r) => { setAlertRuleId(r); setAlertPage(0); }}
        />
      )}

      {subTab === "rules" && (
        <NoisyRules data={rules} error={rulesError} hoursBack={hoursBack} />
      )}

      {subTab === "agents" && (
        <AgentStatus
          data={agents}
          error={agentsError}
          onFilterAlerts={(agentName) => { onSeverityChange(""); setAlertRuleId(""); setSubTab("alerts"); setAlertPage(0); }}
        />
      )}

      {subTab === "change_log" && <RuleChangeLog />}
    </div>
  );
}
