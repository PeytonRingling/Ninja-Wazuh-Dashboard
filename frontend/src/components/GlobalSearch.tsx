import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { api, NoisyRule, WazuhAgent, NinjaDevice } from "../api/client";

interface SearchResult {
  type: "rule" | "agent" | "device";
  id: string;
  primary: string;
  secondary: string;
  badge?: string;
  badgeColor?: string;
}

interface NavigateOptions {
  tab: string;
  subTab?: string;
  agentName?: string;
  ruleId?: string;
  deviceSearch?: string;
}

interface Props {
  onNavigate: (opts: NavigateOptions) => void;
}

const TYPE_ICON: Record<string, string> = {
  rule:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  agent:  "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2",
  device: "M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1",
};
const TYPE_LABEL: Record<string, string> = { rule: "Rules", agent: "Agents", device: "Devices" };

export default function GlobalSearch({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rules, setRules] = useState<NoisyRule[]>([]);
  const [agents, setAgents] = useState<WazuhAgent[]>([]);
  const [devices, setDevices] = useState<NinjaDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K to open
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
      // Load data
      setLoading(true);
      Promise.allSettled([
        api.wazuhNoisyRules(24),
        api.wazuhAgents(),
        api.ninjaDevices(),
      ]).then(([r, a, d]) => {
        if (r.status === "fulfilled") setRules(r.value);
        if (a.status === "fulfilled") setAgents(a.value);
        if (d.status === "fulfilled") setDevices(d.value);
        setLoading(false);
      });
    }
  }, [open]);

  const results = useCallback((): Record<string, SearchResult[]> => {
    const q = query.trim().toLowerCase();
    if (!q) return {};

    const out: Record<string, SearchResult[]> = {};

    const ruleMatches = rules
      .filter(r => r.rule_id.includes(q) || r.description.toLowerCase().includes(q))
      .slice(0, 5)
      .map<SearchResult>(r => ({
        type: "rule", id: r.rule_id,
        primary: r.description, secondary: `Rule ${r.rule_id} · ${r.alert_count.toLocaleString()} alerts`,
        badge: r.severity, badgeColor: r.severity === "critical" ? "#ff2d6d" : r.severity === "high" ? "#ff6b35" : r.severity === "medium" ? "#fbbf24" : "#34d399",
      }));
    if (ruleMatches.length) out["Rules"] = ruleMatches;

    const agentMatches = agents
      .filter(a => a.name?.toLowerCase().includes(q) || a.ip?.includes(q))
      .slice(0, 5)
      .map<SearchResult>(a => ({
        type: "agent", id: a.id,
        primary: a.name, secondary: `${a.ip || "—"} · ${a.status}`,
        badge: a.status, badgeColor: a.status === "active" ? "#34d399" : "#ff2d6d",
      }));
    if (agentMatches.length) out["Agents"] = agentMatches;

    const devMatches = devices
      .filter(d => (d.systemName ?? d.displayName ?? "").toLowerCase().includes(q) || (d.ipAddresses ?? []).some(ip => ip.includes(q)))
      .slice(0, 5)
      .map<SearchResult>(d => ({
        type: "device", id: String(d.id),
        primary: d.displayName ?? d.systemName ?? `Device ${d.id}`,
        secondary: `${d.ipAddresses?.[0] ?? "—"} · ${d.os?.name ?? "—"}`,
        badge: d.offline ? "Offline" : "Online", badgeColor: d.offline ? "#ff2d6d" : "#34d399",
      }));
    if (devMatches.length) out["Devices"] = devMatches;

    return out;
  }, [query, rules, agents, devices]);

  const grouped = results();
  const totalCount = Object.values(grouped).reduce((s, v) => s + v.length, 0);

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    if (r.type === "rule") onNavigate({ tab: "wazuh", subTab: "rules", ruleId: r.id });
    else if (r.type === "agent") onNavigate({ tab: "wazuh", subTab: "agents", agentName: r.primary });
    else if (r.type === "device") onNavigate({ tab: "ninja", subTab: "devices", deviceSearch: r.primary });
  };

  if (!open) return null;

  const modal = (
    <>
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className="fixed top-[20vh] left-1/2 -translate-x-1/2 z-[101] w-full max-w-xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div
          className="rounded-2xl border border-surface-600 overflow-hidden shadow-2xl"
          style={{ background: "linear-gradient(180deg, #1a1a3e 0%, #13132b 100%)", boxShadow: "0 24px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(124,58,237,0.25)" }}
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-600">
            <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search rules, agents, devices…"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {loading && <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />}
            <kbd className="text-[10px] text-slate-600 bg-surface-700 border border-surface-500 rounded px-1.5 py-0.5">Esc</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.trim() && totalCount === 0 && !loading && (
              <p className="text-sm text-slate-500 text-center py-8">No results for "{query}"</p>
            )}
            {!query.trim() && (
              <p className="text-xs text-slate-600 text-center py-6">Type to search across rules, agents, and devices</p>
            )}
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest">{group}</p>
                {items.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-600/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-surface-600 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICON[r.type]} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{r.primary}</p>
                      <p className="text-xs text-slate-500 truncate">{r.secondary}</p>
                    </div>
                    {r.badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: r.badgeColor, background: `${r.badgeColor}22`, border: `1px solid ${r.badgeColor}44` }}>
                        {r.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-surface-600 text-[10px] text-slate-600">
            <span><kbd className="bg-surface-700 border border-surface-500 rounded px-1 py-0.5">↑↓</kbd> navigate</span>
            <span><kbd className="bg-surface-700 border border-surface-500 rounded px-1 py-0.5">↵</kbd> select</span>
            <span><kbd className="bg-surface-700 border border-surface-500 rounded px-1 py-0.5">Ctrl K</kbd> close</span>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
