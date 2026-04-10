import { useState, useEffect, useCallback } from "react";
import { api, Summary } from "./api/client";
import TopBar from "./components/TopBar";
import HomeTab from "./components/home/HomeTab";
import WazuhTab from "./components/wazuh/WazuhTab";
import NinjaTab from "./components/ninja/NinjaTab";
import EndpointIntelTab from "./components/endpoint/EndpointIntelTab";

type Tab = "home" | "wazuh" | "ninja" | "endpoint";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.summary();
      setSummary(data);
      setSummaryError(null);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Failed to load summary");
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const id = setInterval(fetchSummary, 60_000);
    return () => clearInterval(id);
  }, [fetchSummary]);

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <TopBar
        summary={summary}
        summaryError={summaryError}
        onSeverityClick={(sev) => { setTab("wazuh"); setSeverityFilter(sev); }}
      />

      {/* Tab Navigation */}
      <div className="border-b border-surface-600 bg-surface-800 sticky top-[72px] z-10">
        <div className="max-w-screen-2xl mx-auto px-6">
          <nav className="flex gap-1">
            {([
              { key: "home",     label: "Home" },
              { key: "endpoint", label: "Endpoint Intel" },
              { key: "wazuh",    label: "Wazuh SIEM" },
              { key: "ninja",    label: "NinjaOne RMM" },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors duration-150 ${
                  tab === key
                    ? "border-accent text-accent"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
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
            onNavigate={(t) => setTab(t as Tab)}
          />
        )}
        {tab === "wazuh" && (
          <WazuhTab
            hasError={!!summary?.wazuh_error}
            errorMsg={summary?.wazuh_error ?? undefined}
            wazuhSummary={summary?.wazuh ?? null}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
          />
        )}
        {tab === "ninja" && (
          <NinjaTab
            hasError={!!summary?.ninja_error}
            errorMsg={summary?.ninja_error ?? undefined}
          />
        )}
        {tab === "endpoint" && <EndpointIntelTab />}
      </main>
    </div>
  );
}
