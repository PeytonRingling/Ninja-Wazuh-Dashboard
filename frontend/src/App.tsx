import { useState, useEffect, useRef, useCallback } from "react";
import { api, Summary } from "./api/client";
import TopBar from "./components/TopBar";
import HomeTab from "./components/home/HomeTab";
import WazuhTab from "./components/wazuh/WazuhTab";
import NinjaTab from "./components/ninja/NinjaTab";
import EndpointIntelTab from "./components/endpoint/EndpointIntelTab";
import GlobalSearch from "./components/GlobalSearch";

type Tab = "home" | "wazuh" | "ninja" | "endpoint";

const VALID_TABS: Tab[] = ["home", "wazuh", "ninja", "endpoint"];

function tabFromHash(): Tab {
  const h = window.location.hash.slice(1) as Tab;
  return VALID_TABS.includes(h) ? h : "home";
}

export interface WazuhNavOptions {
  subTab?: string;
  agentName?: string;
  ruleId?: string;
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-2.5 text-xs">
          {([
            ["H", "Home tab"],
            ["W", "Wazuh SIEM tab"],
            ["N", "NinjaOne RMM tab"],
            ["E", "Endpoint Intel tab"],
            ["Ctrl+K", "Global search"],
            ["Escape", "Close drawers / search"],
            ["?", "Toggle this panel"],
          ] as [string, string][]).map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-slate-400">{desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-surface-700 border border-surface-500 text-slate-300 font-mono text-[11px]">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [wazuhNav, setWazuhNav] = useState<WazuhNavOptions>({});
  const [ninjaDeviceSearch, setNinjaDeviceSearch] = useState("");
  const [patchFocusDeviceId, setPatchFocusDeviceId] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const prevCritical = useRef<number | null>(null);

  // History API — push state on tab change, restore on back/forward
  const navigate = useCallback((newTab: Tab) => {
    window.history.pushState({ tab: newTab }, "", `#${newTab}`);
    setTab(newTab);
  }, []);

  useEffect(() => {
    // Stamp initial state so popstate fires correctly on first Back press
    window.history.replaceState({ tab: tabFromHash() }, "", window.location.hash || "#home");
    const handler = (e: PopStateEvent) => {
      const t = (e.state?.tab ?? window.location.hash.slice(1)) as Tab;
      setTab(VALID_TABS.includes(t) ? t : "home");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic browser tab title
  useEffect(() => {
    const crit = summary?.wazuh?.critical ?? 0;
    document.title = crit > 0 ? `(${crit} Crit) OPS Dashboard` : "OPS Dashboard";
  }, [summary?.wazuh?.critical]);

  // Theme management
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  // Keyboard shortcuts: H/W/N/E tabs, ? help
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "h": case "H": navigate("home");     break;
        case "w": case "W": navigate("wazuh");    break;
        case "n": case "N": navigate("ninja");    break;
        case "e": case "E": navigate("endpoint"); break;
        case "?": setShowShortcuts(s => !s); break;
        case "Escape": setShowShortcuts(false); break;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [navigate]);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.summary();
      setSummary(data);
      setSummaryError(null);
      // Browser notifications for new critical/high alerts
      if (data.wazuh && Notification.permission === "granted") {
        const newCrit = data.wazuh.critical;
        const newHigh = data.wazuh.high;
        if (prevCritical.current !== null) {
          if (newCrit > prevCritical.current) {
            new Notification("🔴 New Critical Alerts", {
              body: `${newCrit} critical alert${newCrit !== 1 ? "s" : ""} detected. Open dashboard for details.`,
              icon: "/favicon.ico",
              tag: "wazuh-critical",
            });
          }
        }
        prevCritical.current = newCrit + newHigh;
      }
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Failed to load summary");
    }
  }, []);

  useEffect(() => {
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchSummary();
    const id = setInterval(fetchSummary, 60_000);
    return () => clearInterval(id);
  }, [fetchSummary]);

  const handleGlobalNav = (opts: { tab: string; subTab?: string; agentName?: string; ruleId?: string; deviceSearch?: string }) => {
    navigate(opts.tab as Tab);
    if (opts.tab === "wazuh") setWazuhNav({ subTab: opts.subTab, agentName: opts.agentName, ruleId: opts.ruleId });
    if (opts.tab === "ninja" && opts.deviceSearch) setNinjaDeviceSearch(opts.deviceSearch);
    if (opts.tab !== "ninja") setPatchFocusDeviceId(null);
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      <GlobalSearch onNavigate={handleGlobalNav} />
      <TopBar
        summary={summary}
        summaryError={summaryError}
        onSeverityClick={(sev) => { navigate("wazuh"); setSeverityFilter(sev); }}
        isDark={isDark}
        onThemeToggle={() => setIsDark(d => !d)}
      />

      {/* Tab Navigation */}
      <div
        className="sticky top-[60px] z-10"
        style={isDark ? {
          background:   "#0d0d1a",
          borderBottom: "1px solid #2d2b55",
          boxShadow:    "0 4px 24px rgba(0,0,0,0.5)",
        } : {
          background:   "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          boxShadow:    "0 2px 8px rgba(99, 102, 241, 0.06)",
        }}
      >
        <div className="max-w-screen-2xl mx-auto px-6">
          <nav className="flex gap-0.5">
            {([
              { key: "home",     label: "Home" },
              { key: "endpoint", label: "Endpoint Intel" },
              { key: "wazuh",    label: "Wazuh SIEM" },
              { key: "ninja",    label: "NinjaOne RMM" },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => navigate(key)}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all duration-150 tracking-wide ${
                  tab === key
                    ? "text-accent"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                style={tab === key ? {
                  borderBottomColor: "#7c3aed",
                  textShadow: isDark ? "0 0 20px rgba(124,58,237,0.55)" : "none",
                } : {}}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6">
        {tab === "home" && (
          <HomeTab
            summary={summary}
            summaryError={summaryError}
            onNavigate={(t) => navigate(t as Tab)}
            onNavigateToWazuh={(agentName) => { navigate("wazuh"); setWazuhNav({ subTab: "alerts", agentName }); }}
            onNavigateToPatch={(deviceId) => { navigate("ninja"); setPatchFocusDeviceId(deviceId); }}
          />
        )}
        {tab === "wazuh" && (
          <WazuhTab
            hasError={!!summary?.wazuh_error}
            errorMsg={summary?.wazuh_error ?? undefined}
            wazuhSummary={summary?.wazuh ?? null}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
            navOptions={wazuhNav}
            onNavConsumed={() => setWazuhNav({})}
          />
        )}
        {tab === "ninja" && (
          <NinjaTab
            hasError={!!summary?.ninja_error}
            errorMsg={summary?.ninja_error ?? undefined}
            initialDeviceSearch={ninjaDeviceSearch}
            initialPatchDeviceId={patchFocusDeviceId ?? undefined}
            onNavigateToWazuh={(agentName) => { navigate("wazuh"); setWazuhNav({ subTab: "alerts", agentName }); }}
          />
        )}
        {tab === "endpoint" && <EndpointIntelTab />}
      </main>
    </div>
  );
}
