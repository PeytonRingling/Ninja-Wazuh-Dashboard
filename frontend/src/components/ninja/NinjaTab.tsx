import { useState, useEffect, useCallback } from "react";
import { api, NinjaDevice, PatchSummary, NinjaActivity } from "../../api/client";
import DeviceGrid from "./DeviceGrid";
import PatchCompliance from "./PatchCompliance";
import RecentActivity from "./RecentActivity";
import ErrorState from "../ErrorState";
import RefreshButton from "../RefreshButton";

interface Props {
  hasError: boolean;
  errorMsg?: string;
}

type SubTab = "devices" | "patches" | "activity";

export default function NinjaTab({ hasError, errorMsg }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("devices");

  const [devices, setDevices] = useState<NinjaDevice[] | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  const [patches, setPatches] = useState<PatchSummary | null>(null);
  const [patchesError, setPatchesError] = useState<string | null>(null);

  const [activities, setActivities] = useState<NinjaActivity[] | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [activityDevice, setActivityDevice] = useState("");
  const [activityType, setActivityType] = useState("");

  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = useCallback(async () => {
    setDevicesError(null);
    try { setDevices(await api.ninjaDevices()); }
    catch (e) { setDevicesError(e instanceof Error ? e.message : "Failed"); }
  }, []);

  const loadPatches = useCallback(async () => {
    setPatchesError(null);
    try { setPatches(await api.ninjaPatches()); }
    catch (e) { setPatchesError(e instanceof Error ? e.message : "Failed"); }
  }, []);

  const loadActivities = useCallback(async () => {
    setActivitiesError(null);
    try {
      setActivities(await api.ninjaActivities({
        device_id: activityDevice || undefined,
        activity_type: activityType || undefined,
      }));
    } catch (e) { setActivitiesError(e instanceof Error ? e.message : "Failed"); }
  }, [activityDevice, activityType]);

  const loadAll = useCallback(() => {
    loadDevices();
    loadPatches();
    loadActivities();
  }, [loadDevices, loadPatches, loadActivities]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => clearInterval(id);
  }, [loadAll]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await api.refreshNinja().catch(() => {});
    loadAll();
    setTimeout(() => setRefreshing(false), 800);
  };

  if (hasError) return <ErrorState title="NinjaOne RMM Unavailable" message={errorMsg} />;

  const onlineCount = devices ? devices.filter((d) => !d.offline).length : null;
  const offlineCount = devices && onlineCount !== null ? devices.length - onlineCount : null;

  // Derive activity severity counts for the summary bar
  const activityBadges = activities
    ? ["critical", "high", "medium", "low"].reduce((acc, s) => {
        const count = activities.filter((a) => a.severity?.toLowerCase() === s ||
          (s === "medium" && a.severity?.toLowerCase() === "moderate")).length;
        if (count > 0) acc.push({ sev: s, count });
        return acc;
      }, [] as { sev: string; count: number }[])
    : [];

  const SEV_COLOR: Record<string, string> = {
    critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400", low: "text-green-400",
  };

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      {/* ── Top bar: summary + sub-tab nav + refresh ── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Summary stats */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-100 tabular-nums">
                  {devices ? devices.length : <span className="skeleton inline-block w-8 h-6 rounded" />}
                </div>
                <div className="text-xs text-slate-500">Total Devices</div>
              </div>
              <div className="h-8 w-px bg-surface-600" />
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
                  <span className="text-sm font-semibold text-green-400 tabular-nums">
                    {onlineCount ?? <span className="skeleton inline-block w-5 h-4 rounded" />}
                  </span>
                  <span className="text-xs text-slate-500">online</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <span className="text-sm font-semibold text-slate-400 tabular-nums">
                    {offlineCount ?? <span className="skeleton inline-block w-5 h-4 rounded" />}
                  </span>
                  <span className="text-xs text-slate-500">offline</span>
                </div>
              </div>
            </div>

            {patches && (
              <>
                <div className="h-8 w-px bg-surface-600 hidden sm:block" />
                <div className="hidden sm:flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-sm font-semibold text-green-400 tabular-nums">{patches.fully_patched}</span>
                    <span className="text-xs text-slate-500">patched</span>
                  </div>
                  {patches.patches_pending > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-yellow-400" />
                      <span className="text-sm font-semibold text-yellow-400 tabular-nums">{patches.patches_pending}</span>
                      <span className="text-xs text-slate-500">pending</span>
                    </div>
                  )}
                  {patches.patches_failed > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="text-sm font-semibold text-red-400 tabular-nums">{patches.patches_failed}</span>
                      <span className="text-xs text-slate-500">failed</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <RefreshButton onClick={handleRefresh} loading={refreshing} />
        </div>

        {/* Sub-tab navigation */}
        <div className="flex gap-1 mt-4 border-t border-surface-600 pt-3">
          {([
            { key: "devices", label: "Devices", icon: "M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0", count: devices?.length },
            { key: "patches", label: "Patches", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", count: patches ? (patches.patches_failed + patches.patches_pending) || null : null, countColor: patches && patches.patches_failed > 0 ? "text-red-400" : "text-yellow-400" },
            { key: "activity", label: "Activity", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9", count: activities?.length },
          ] as { key: SubTab; label: string; icon: string; count?: number | null; countColor?: string }[]).map(({ key, label, icon, count, countColor }) => (
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
                <span className={`text-xs font-semibold tabular-nums ${countColor ?? "text-slate-500"}`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sub-tab content ── */}
      {subTab === "devices" && (
        <DeviceGrid data={devices} error={devicesError} />
      )}
      {subTab === "patches" && (
        <PatchCompliance data={patches} error={patchesError} devices={devices ?? []} />
      )}
      {subTab === "activity" && (
        <RecentActivity
          data={activities}
          error={activitiesError}
          devices={devices ?? []}
          deviceFilter={activityDevice}
          onDeviceFilterChange={setActivityDevice}
          typeFilter={activityType}
          onTypeFilterChange={setActivityType}
        />
      )}
    </div>
  );
}
