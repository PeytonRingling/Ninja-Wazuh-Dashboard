import { useState, useEffect, useRef, useCallback } from "react";
import { api, Summary } from "./api/client";
import TopBar from "./components/TopBar";
import HomeTab from "./components/home/HomeTab";
import WazuhTab from "./components/wazuh/WazuhTab";
import NinjaTab from "./components/ninja/NinjaTab";
import EndpointIntelTab from "./components/endpoint/EndpointIntelTab";
import SettingsTab from "./components/settings/SettingsTab";
import GuideTab from "./components/guide/GuideTab";
import ThreatIntelTab from "./components/threat-intel/ThreatIntelTab";
import GlobalSearch from "./components/GlobalSearch";
import FloatingHelp from "./components/FloatingHelp";

type Tab = "home" | "wazuh" | "ninja" | "endpoint" | "threat" | "guide" | "settings";

const VALID_TABS: Tab[] = ["home", "wazuh", "ninja", "endpoint", "threat", "guide", "settings"];

function tabFromHash(): Tab {
  const h = window.location.hash.slice(1) as Tab;
  return VALID_TABS.includes(h) ? h : "home";
}

export interface WazuhNavOptions {
  subTab?: string;
  agentName?: string;
  ruleId?: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [wazuhNav, setWazuhNav] = useState<WazuhNavOptions>({});
  const [ninjaDeviceSearch, setNinjaDeviceSearch] = useState("");
  const [patchFocusDeviceId, setPatchFocusDeviceId] = useState<number | null>(null);
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

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.summary();
      setSummary(data);
      setSummaryError(null);
      if (data.wazuh && Notification.permission === "granted") {
        const newCrit = data.wazuh.critical;
        if (prevCritical.current !== null && newCrit > prevCritical.current) {
          new Notification("🔴 New Critical Alerts", {
            body: `${newCrit} critical alert${newCrit !== 1 ? "s" : ""} detected. Open dashboard for details.`,
            icon: "/favicon.ico",
            tag: "wazuh-critical",
          });
        }
        prevCritical.current = newCrit + data.wazuh.high;
      }
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Failed to load summary");
    }
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchSummary();
    const id = setInterval(fetchSummary, 60_000);
    return () => clearInterval(id);
  }, [fetchSummary]);

  // Keyboard shortcuts: H/W/N/E/G/S tabs, R refresh, D dark toggle
  // ? shortcut is handled by FloatingHelp component
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
        case "t": case "T": navigate("threat");    break;
        case "g": case "G": navigate("guide");    break;
        case "s": case "S": navigate("settings"); break;
        case "r": case "R": fetchSummary();       break;
        case "d": case "D": setIsDark(d => !d);  break;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [navigate, fetchSummary]);

  const handleGlobalNav = (opts: {
    tab: string; subTab?: string; agentName?: string; ruleId?: string; deviceSearch?: string;
  }) => {
    navigate(opts.tab as Tab);
    if (opts.tab === "wazuh") setWazuhNav({ subTab: opts.subTab, agentName: opts.agentName, ruleId: opts.ruleId });
    if (opts.tab === "ninja" && opts.deviceSearch) setNinjaDeviceSearch(opts.deviceSearch);
    if (opts.tab !== "ninja") setPatchFocusDeviceId(null);
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <FloatingHelp />
      <GlobalSearch onNavigate={handleGlobalNav} />
      <TopBar
        summary={summary}
        summaryError={summaryError}
        onSeverityClick={(sev) => { navigate("wazuh"); setSeverityFilter(sev); }}
        isDark={isDark}
        onThemeToggle={() => setIsDark(d => !d)}
        onSettingsClick={() => navigate("settings")}
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
              { key: "threat",   label: "Threat Intel" },
              { key: "wazuh",    label: "Wazuh SIEM" },
              { key: "ninja",    label: "NinjaOne RMM" },
              { key: "guide",    label: "Guide" },
              { key: "settings", label: "Settings" },
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
        {tab === "threat"   && (
          <ThreatIntelTab
            onNavigate={(t, deviceSearch) => {
              navigate(t as Tab);
              if (t === "ninja" && deviceSearch) setNinjaDeviceSearch(deviceSearch);
            }}
          />
        )}
        {tab === "guide"    && <GuideTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
