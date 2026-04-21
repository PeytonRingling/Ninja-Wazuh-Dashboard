import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { api, AppSettings, CveKeyword, ConnectionTestResult, UserAccount } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

// ── Primitives ─────────────────────────────────────────────────────────────────

function Toggle({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-slate-300 font-medium">{label}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${checked ? "bg-accent" : "bg-surface-600"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
      </button>
    </div>
  );
}

function NumberField({ label, description, value, onChange, min, max, unit }: {
  label: string; description?: string; value: number;
  onChange: (v: number) => void; min?: number; max?: number; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm text-slate-300 font-medium">{label}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number" value={value} min={min} max={max}
          onChange={e => onChange(Number(e.target.value))}
          className="w-20 text-right px-2 py-1.5 rounded-lg text-sm bg-surface-800 border border-surface-600 text-slate-200 focus:outline-none focus:border-accent/60 tabular-nums"
        />
        {unit && <span className="text-xs text-slate-500 w-14">{unit}</span>}
      </div>
    </div>
  );
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  const ok = result.status === "connected";
  return (
    <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={ok
      ? { background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }
      : { background: "rgba(255,45,109,0.08)", border: "1px solid rgba(255,45,109,0.25)", color: "#ff2d6d" }}>
      <span className="font-semibold">{ok ? "Connected" : "Failed"}</span>
      {result.latency_ms !== undefined && <span className="opacity-70">· {result.latency_ms} ms</span>}
      {result.error && <span className="opacity-70 truncate">· {result.error}</span>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-surface-700" />;
}

const inputCls = "w-full px-3 py-2 rounded-lg text-sm outline-none bg-surface-800 border border-surface-600 focus:border-accent transition-colors" as const;

// ── Tab definitions ────────────────────────────────────────────────────────────

type TabId = "general" | "alerts" | "thresholds" | "integrations" | "email" | "users";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    id: "thresholds",
    label: "Thresholds",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    id: "email",
    label: "Email",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "users",
    label: "Users",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

// ── Main drawer ────────────────────────────────────────────────────────────────

export default function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user: currentUser, logout } = useAuth();
  const [activeTab, setActiveTab]     = useState<TabId>("general");
  const [original, setOriginal]       = useState<AppSettings | null>(null);
  const [draft, setDraft]             = useState<AppSettings | null>(null);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const toastTimer                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = !!(original && draft && JSON.stringify(draft) !== JSON.stringify(original));

  // Load settings whenever the drawer opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getSettings()
      .then(s => { setOriginal(s); setDraft(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  function showToast(type: "ok" | "err", text: string) {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft(d => d ? { ...d, [key]: value } : d);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.saveSettings(draft);
      setOriginal(draft);
      showToast("ok", "Settings saved.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const drawer = (
    <div className="fixed inset-0 z-[200] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative flex flex-col h-full w-full max-w-2xl shadow-2xl"
        style={{ background: "#0d0d1a", borderLeft: "1px solid #2d2b55" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid #2d2b55" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Settings</h2>
              <p className="text-xs text-slate-500">Signed in as <span className="text-slate-400 font-mono">{currentUser?.username}</span></p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-surface-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid #2d2b55", background: "#0a0a18" }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="space-y-4">
              {[120, 160, 120].map((h, i) => (
                <div key={i} className="skeleton rounded-xl" style={{ height: h }} />
              ))}
            </div>
          ) : !draft ? (
            <p className="text-sm text-red-400">Failed to load settings.</p>
          ) : (
            <>
              {activeTab === "general"      && <GeneralTab      draft={draft} patch={patch} />}
              {activeTab === "alerts"       && <AlertsTab       draft={draft} patch={patch} />}
              {activeTab === "thresholds"   && <ThresholdsTab   draft={draft} patch={patch} />}
              {activeTab === "integrations" && <IntegrationsTab draft={draft} />}
              {activeTab === "email"        && <EmailTab        draft={draft} patch={patch} />}
              {activeTab === "users"        && <UsersTab        currentUser={currentUser} onLogout={logout} onClose={onClose} />}
            </>
          )}
        </div>

        {/* Save bar */}
        {isDirty && (
          <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4"
            style={{ borderTop: "1px solid #2d2b55", background: "#0a0a18" }}>
            <span className="text-xs text-slate-500">Unsaved changes</span>
            <div className="flex gap-3">
              <button
                onClick={() => setDraft(original)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors text-slate-300 border-surface-600 bg-surface-800 hover:bg-surface-700"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium"
            style={toast.type === "ok"
              ? { background: "rgba(13,20,15,0.97)", border: "1px solid rgba(52,211,153,0.4)", color: "#34d399" }
              : { background: "rgba(20,13,15,0.97)", border: "1px solid rgba(255,45,109,0.4)", color: "#ff2d6d" }}>
            {toast.text}
            <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

// ── General tab ────────────────────────────────────────────────────────────────

function GeneralTab({ draft, patch }: { draft: AppSettings; patch: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Appearance">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Default theme</label>
            <select value={draft.default_theme} onChange={e => patch("default_theme", e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-surface-800 border border-surface-600 text-slate-200 focus:outline-none focus:border-accent/60"
              style={{ background: "#0d0d1a" }}>
              <option value="dark">Dark (Midnight Purple)</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Default time window</label>
            <select value={draft.default_time_window} onChange={e => patch("default_time_window", e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-surface-800 border border-surface-600 text-slate-200 focus:outline-none focus:border-accent/60"
              style={{ background: "#0d0d1a" }}>
              {["1h", "3h", "6h", "12h", "24h"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </Section>
      <Divider />
      <Section title="Dashboard Behaviour">
        <NumberField label="Auto-refresh interval" value={draft.auto_refresh_interval}
          onChange={v => patch("auto_refresh_interval", v)} min={10} max={3600} unit="seconds" />
        <NumberField label="Noisy rules page size" value={draft.noisy_rules_page_size}
          onChange={v => patch("noisy_rules_page_size", v)} min={5} max={200} unit="rows" />
        <NumberField label="Alerts page size" value={draft.alerts_page_size}
          onChange={v => patch("alerts_page_size", v)} min={5} max={200} unit="rows" />
      </Section>
    </div>
  );
}

// ── Alerts tab ─────────────────────────────────────────────────────────────────

function AlertsTab({ draft, patch }: { draft: AppSettings; patch: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Browser Notifications" description="Push notifications for new Wazuh alerts. Requires notification permission.">
        <Toggle label="Enable browser notifications" checked={draft.notifications_enabled}
          onChange={v => patch("notifications_enabled", v)} />
        <div className={`space-y-3 pl-4 border-l-2 border-surface-600 transition-opacity ${!draft.notifications_enabled ? "opacity-40 pointer-events-none" : ""}`}>
          <Toggle label="Critical alerts" checked={draft.notify_critical} onChange={v => patch("notify_critical", v)} />
          <Toggle label="High alerts"     checked={draft.notify_high}     onChange={v => patch("notify_high",     v)} />
          <Toggle label="Medium alerts"   checked={draft.notify_medium}   onChange={v => patch("notify_medium",   v)} />
          <Toggle label="Low alerts"      checked={draft.notify_low}      onChange={v => patch("notify_low",      v)} />
          <NumberField label="Cooldown between notifications"
            description="Minimum time before re-notifying on the same severity."
            value={draft.notification_cooldown}
            onChange={v => patch("notification_cooldown", v)} min={1} max={1440} unit="minutes" />
        </div>
      </Section>
      <Divider />
      <Section title="CVE Keyword Filters" description="Keywords used to scope Threat Intel CVE searches. Click to toggle.">
        <CveKeywords draft={draft} patch={patch} />
      </Section>
    </div>
  );
}

function CveKeywords({ draft, patch }: { draft: AppSettings; patch: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const [newKw, setNewKw] = useState("");
  const add = () => {
    const kw = newKw.trim();
    if (!kw || draft.cve_keywords.some(k => k.keyword.toLowerCase() === kw.toLowerCase())) return;
    patch("cve_keywords", [...draft.cve_keywords, { keyword: kw, enabled: true }]);
    setNewKw("");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 min-h-10">
        {draft.cve_keywords.map((kw: CveKeyword, i: number) => (
          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
            style={kw.enabled
              ? { background: "rgba(124,58,237,0.14)", border: "1px solid rgba(124,58,237,0.32)", color: "#a855f7" }
              : { background: "rgba(45,43,85,0.5)", border: "1px solid rgba(45,43,85,0.8)", color: "#5b5a8a" }}>
            <button onClick={() => patch("cve_keywords", draft.cve_keywords.map((k: CveKeyword, j: number) =>
              j === i ? { ...k, enabled: !k.enabled } : k))} className="hover:opacity-80">{kw.keyword}</button>
            <button onClick={() => patch("cve_keywords", draft.cve_keywords.filter((_: CveKeyword, j: number) => j !== i))}
              className="text-slate-600 hover:text-slate-400 ml-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {draft.cve_keywords.length === 0 && <span className="text-xs text-slate-600 italic">No keywords.</span>}
      </div>
      <div className="flex gap-2">
        <input type="text" placeholder="Add keyword…" value={newKw} onChange={e => setNewKw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-surface-800 border border-surface-600 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/60" />
        <button onClick={add} className="btn-primary px-4 py-1.5 text-xs shrink-0">Add</button>
      </div>
    </div>
  );
}

// ── Thresholds tab ─────────────────────────────────────────────────────────────

function ThresholdsTab({ draft, patch }: { draft: AppSettings; patch: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Agent Activity" description="How recently an agent must have checked in to show as green or yellow.">
        <NumberField label="Green (active)"  value={draft.agent_green_minutes}  onChange={v => patch("agent_green_minutes",  v)} min={1} unit="minutes" />
        <NumberField label="Yellow (warning)" value={draft.agent_yellow_minutes} onChange={v => patch("agent_yellow_minutes", v)} min={1} unit="minutes" />
      </Section>
      <Divider />
      <Section title="Device Offline" description="Time thresholds for marking devices as offline.">
        <NumberField label="Yellow" value={draft.offline_yellow_hours} onChange={v => patch("offline_yellow_hours", v)} min={1} unit="hours" />
        <NumberField label="Orange" value={draft.offline_orange_hours} onChange={v => patch("offline_orange_hours", v)} min={1} unit="hours" />
      </Section>
      <Divider />
      <Section title="Fleet Health Ring" description="Percentage of online devices for each colour band.">
        <NumberField label="Green threshold" value={draft.fleet_green_pct} onChange={v => patch("fleet_green_pct", v)} min={0} max={100} unit="%" />
        <NumberField label="Amber threshold" value={draft.fleet_amber_pct} onChange={v => patch("fleet_amber_pct", v)} min={0} max={100} unit="%" />
      </Section>
      <Divider />
      <Section title="Patch Age" description="How old a pending patch must be before it changes colour.">
        <NumberField label="Yellow" value={draft.patch_yellow_days} onChange={v => patch("patch_yellow_days", v)} min={1} unit="days" />
        <NumberField label="Orange" value={draft.patch_orange_days} onChange={v => patch("patch_orange_days", v)} min={1} unit="days" />
      </Section>
    </div>
  );
}

// ── Integrations tab ───────────────────────────────────────────────────────────

function IntegrationsTab({ draft }: { draft: AppSettings }) {
  const [wazuhTest, setWazuhTest]   = useState<ConnectionTestResult | null>(null);
  const [ninjaTest, setNinjaTest]   = useState<ConnectionTestResult | null>(null);
  const [wazuhBusy, setWazuhBusy]   = useState(false);
  const [ninjaBusy, setNinjaBusy]   = useState(false);

  return (
    <div className="space-y-6">
      <Section title="Wazuh SIEM" description="Credentials loaded from .env — restart the container to apply changes.">
        <div className="px-3 py-2.5 rounded-lg text-sm font-mono text-slate-400 bg-surface-800 border border-surface-600">
          {draft.wazuh_url_display || <span className="text-slate-600 italic">Not configured</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">User: <span className="font-mono text-slate-400">{draft.wazuh_username_display || "—"}</span></div>
          <div className={`text-xs font-semibold px-2 py-0.5 rounded ${draft.wazuh_configured ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>
            {draft.wazuh_configured ? "Configured" : "Not configured"}
          </div>
        </div>
        <button onClick={async () => { setWazuhBusy(true); setWazuhTest(null); try { setWazuhTest(await api.testWazuhConnection()); } finally { setWazuhBusy(false); } }}
          disabled={wazuhBusy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
          {wazuhBusy ? "Testing…" : "Test Connection"}
        </button>
        {wazuhTest && <TestResult result={wazuhTest} />}
      </Section>
      <Divider />
      <Section title="NinjaOne RMM" description="Credentials loaded from .env — restart the container to apply changes.">
        <div className="px-3 py-2.5 rounded-lg text-sm font-mono text-slate-400 bg-surface-800 border border-surface-600">
          {draft.ninja_url_display || <span className="text-slate-600 italic">Not configured</span>}
        </div>
        <div className={`text-xs font-semibold px-2 py-0.5 rounded w-fit ${draft.ninja_configured ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>
          {draft.ninja_configured ? "Configured" : "Not configured"}
        </div>
        <button onClick={async () => { setNinjaBusy(true); setNinjaTest(null); try { setNinjaTest(await api.testNinjaConnection()); } finally { setNinjaBusy(false); } }}
          disabled={ninjaBusy} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
          {ninjaBusy ? "Testing…" : "Test Connection"}
        </button>
        {ninjaTest && <TestResult result={ninjaTest} />}
      </Section>
    </div>
  );
}

// ── Email tab ──────────────────────────────────────────────────────────────────

function EmailTab({ draft, patch }: { draft: AppSettings; patch: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const [testTo, setTestTo]     = useState("");
  const [testing, setTesting]   = useState(false);
  const [testMsg, setTestMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);

  return (
    <div className="space-y-6">
      <Section title="SMTP Configuration" description="Used for user invites and alert notifications. Works with Gmail, Outlook, or any SMTP server.">
        <Toggle label="Enable SMTP" checked={draft.smtp_enabled} onChange={v => patch("smtp_enabled", v)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Host</label>
            <input className={inputCls} style={{ color: "#f1f5f9" }} value={draft.smtp_host}
              onChange={e => patch("smtp_host", e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Port</label>
            <input type="number" className={inputCls} style={{ color: "#f1f5f9" }} value={draft.smtp_port}
              onChange={e => patch("smtp_port", Number(e.target.value))} placeholder="587" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Username</label>
            <input className={inputCls} style={{ color: "#f1f5f9" }} value={draft.smtp_username}
              onChange={e => patch("smtp_username", e.target.value)} placeholder="you@example.com" autoComplete="off" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Password</label>
            <input type="password" className={inputCls} style={{ color: "#f1f5f9" }} value={draft.smtp_password}
              onChange={e => patch("smtp_password", e.target.value)} autoComplete="new-password" placeholder="App password" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">From Address</label>
            <input type="email" className={inputCls} style={{ color: "#f1f5f9" }} value={draft.smtp_from_email}
              onChange={e => patch("smtp_from_email", e.target.value)} placeholder="dashboard@example.com" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">From Name</label>
            <input className={inputCls} style={{ color: "#f1f5f9" }} value={draft.smtp_from_name}
              onChange={e => patch("smtp_from_name", e.target.value)} placeholder="OPS Dashboard" />
          </div>
        </div>
        <Toggle label="Use STARTTLS" description="Recommended for port 587. Disable for port 465 (SSL)." checked={draft.smtp_tls} onChange={v => patch("smtp_tls", v)} />
      </Section>
      <Divider />
      <Section title="Alert Email Notifications"
        description="Automatically email when Wazuh alert counts increase. SMTP must be enabled above.">
        <Toggle
          label="Enable alert email notifications"
          description="Sends an email when new alerts of the selected severities are detected."
          checked={draft.email_alerts_enabled}
          onChange={v => patch("email_alerts_enabled", v)}
        />
        <div className={`space-y-3 transition-opacity ${!draft.email_alerts_enabled ? "opacity-40 pointer-events-none" : ""}`}>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Send alerts to</label>
            <input
              type="email"
              className={inputCls}
              style={{ color: "#f1f5f9" }}
              value={draft.email_alert_to}
              onChange={e => patch("email_alert_to", e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="pl-4 border-l-2 border-surface-600 space-y-3">
            <Toggle label="Critical alerts" checked={draft.email_notify_critical} onChange={v => patch("email_notify_critical", v)} />
            <Toggle label="High alerts"     checked={draft.email_notify_high}     onChange={v => patch("email_notify_high",     v)} />
            <Toggle label="Medium alerts"   checked={draft.email_notify_medium}   onChange={v => patch("email_notify_medium",   v)} />
            <Toggle label="Low alerts"      checked={draft.email_notify_low}      onChange={v => patch("email_notify_low",      v)} />
            <NumberField
              label="Cooldown between emails"
              description="Won't send another email until this much time has passed, even if more alerts arrive."
              value={draft.email_cooldown_minutes}
              onChange={v => patch("email_cooldown_minutes", v)}
              min={1} max={1440} unit="minutes"
            />
          </div>
        </div>
      </Section>
      <Divider />
      <Section title="Send Test Email" description="Save your settings first, then send a test to verify everything works.">
        <div className="flex gap-2">
          <input type="email" className={inputCls} style={{ color: "#f1f5f9" }} value={testTo}
            onChange={e => setTestTo(e.target.value)} placeholder="your@email.com" />
          <button onClick={async () => {
            if (!testTo.trim()) return;
            setTesting(true); setTestMsg(null);
            try { await api.sendTestEmail(testTo.trim()); setTestMsg({ type: "ok", text: `Test sent to ${testTo}` }); }
            catch (e) { setTestMsg({ type: "err", text: e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed" }); }
            finally { setTesting(false); }
          }} disabled={testing || !testTo.trim()}
            className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50 whitespace-nowrap">
            {testing ? "Sending…" : "Send Test"}
          </button>
        </div>
        {testMsg && <p className={`text-xs ${testMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>{testMsg.text}</p>}
        <p className="text-[11px] text-slate-600">
          For Gmail: use an App Password (Google → Security → 2-Step Verification → App Passwords).
        </p>
      </Section>
    </div>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────────

function UsersTab({ currentUser, onLogout, onClose }: {
  currentUser: { username: string; role: string } | null;
  onLogout: () => void;
  onClose: () => void;
}) {
  const isAdmin = currentUser?.role === "admin";
  const [users, setUsers]               = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUsername, setNewUsername]   = useState("");
  const [newPassword, setNewPassword]   = useState("");
  const [newRole, setNewRole]           = useState<"viewer" | "admin">("viewer");
  const [newEmail, setNewEmail]         = useState("");
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState<string | null>(null);
  const [resetTarget, setResetTarget]   = useState<string | null>(null);
  const [resetPw, setResetPw]           = useState("");
  const [resetting, setResetting]       = useState(false);
  const [inviteTarget, setInviteTarget] = useState<{ username: string; password: string } | null>(null);
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviting, setInviting]         = useState(false);
  const [inviteMsg, setInviteMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [ownCurrent, setOwnCurrent]     = useState("");
  const [ownNew, setOwnNew]             = useState("");
  const [ownNew2, setOwnNew2]           = useState("");
  const [changingPw, setChangingPw]     = useState(false);
  const [pwMsg, setPwMsg]               = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadUsers = () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    api.authListUsers().then(setUsers).catch(() => {}).finally(() => setLoadingUsers(false));
  };
  useEffect(() => { loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Change own password */}
      <Section title="Change Password" description={`Currently signed in as ${currentUser?.username}`}>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Current password</label>
            <input type="password" className={inputCls} style={{ color: "#f1f5f9" }} value={ownCurrent}
              onChange={e => setOwnCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">New password</label>
              <input type="password" className={inputCls} style={{ color: "#f1f5f9" }} value={ownNew}
                onChange={e => setOwnNew(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Confirm</label>
              <input type="password" className={inputCls} style={{ color: "#f1f5f9" }} value={ownNew2}
                onChange={e => setOwnNew2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
        </div>
        {pwMsg && <p className={`text-xs ${pwMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>{pwMsg.text}</p>}
        <div className="flex items-center justify-between">
          <button onClick={async () => {
            setPwMsg(null);
            if (ownNew !== ownNew2) { setPwMsg({ type: "err", text: "Passwords do not match" }); return; }
            setChangingPw(true);
            try {
              await api.authChangeOwnPassword(ownCurrent, ownNew);
              setOwnCurrent(""); setOwnNew(""); setOwnNew2("");
              setPwMsg({ type: "ok", text: "Password changed successfully" });
            } catch (e) {
              setPwMsg({ type: "err", text: e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed" });
            } finally { setChangingPw(false); }
          }} disabled={changingPw || !ownCurrent || !ownNew || !ownNew2}
            className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {changingPw ? "Updating…" : "Update Password"}
          </button>
          <button onClick={() => { onLogout(); onClose(); }}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors">
            Sign out
          </button>
        </div>
      </Section>

      {/* Admin: user management */}
      {isAdmin && (
        <>
          <Divider />
          <Section title="User Management" description="Add or remove users. Admins can manage users; viewers have read-only access.">
            {/* User table */}
            <div className="rounded-lg overflow-hidden border border-surface-700">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(13,13,26,0.6)", borderBottom: "1px solid #2d2b55" }}>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Username</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr><td colSpan={4} className="px-4 py-3 text-slate-600 text-xs">Loading…</td></tr>
                  ) : users.map(u => (
                    <tr key={u.username} style={{ borderBottom: "1px solid rgba(45,43,85,0.4)" }}>
                      <td className="px-4 py-2.5 font-mono text-slate-200 text-xs">
                        {u.username}
                        {u.username === currentUser?.username && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}>you</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${u.role === "admin" ? "bg-accent/15 text-accent" : "bg-slate-700/40 text-slate-400"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setInviteTarget({ username: u.username, password: "" }); setInviteEmail(""); setInviteMsg(null); }}
                            className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors">Invite</button>
                          <button onClick={() => { setResetTarget(u.username); setResetPw(""); }}
                            className="text-[10px] text-slate-500 hover:text-yellow-400 transition-colors">Reset pw</button>
                          {u.username !== currentUser?.username && (
                            <button onClick={async () => { if (!confirm(`Delete "${u.username}"?`)) return; await api.authDeleteUser(u.username).catch(() => {}); loadUsers(); }}
                              className="text-[10px] text-slate-500 hover:text-red-400 transition-colors">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invite panel */}
            {inviteTarget && (
              <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-purple-400 shrink-0">Invite <span className="font-mono">{inviteTarget.username}</span></span>
                  <input type="email" placeholder="Recipient email" className="flex-1 min-w-32 px-3 py-1.5 rounded text-xs bg-surface-800 border border-surface-600 outline-none focus:border-purple-500"
                    style={{ color: "#f1f5f9" }} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                  <input type="password" placeholder="Their password" className="flex-1 min-w-32 px-3 py-1.5 rounded text-xs bg-surface-800 border border-surface-600 outline-none focus:border-purple-500"
                    style={{ color: "#f1f5f9" }} value={inviteTarget.password} onChange={e => setInviteTarget(t => t ? { ...t, password: e.target.value } : t)} />
                  <button onClick={async () => {
                    if (!inviteTarget || !inviteEmail.trim()) return;
                    setInviting(true); setInviteMsg(null);
                    try { await api.sendInviteEmail(inviteTarget.username, inviteEmail.trim(), inviteTarget.password); setInviteMsg({ type: "ok", text: `Invite sent to ${inviteEmail}` }); setTimeout(() => { setInviteTarget(null); setInviteEmail(""); setInviteMsg(null); }, 2000); }
                    catch (e) { setInviteMsg({ type: "err", text: e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed" }); }
                    finally { setInviting(false); }
                  }} disabled={inviting || !inviteEmail || !inviteTarget.password}
                    className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50" style={{ background: "#7c3aed" }}>
                    {inviting ? "…" : "Send"}
                  </button>
                  <button onClick={() => setInviteTarget(null)} className="text-slate-500 hover:text-slate-300 text-xs">Cancel</button>
                </div>
                {inviteMsg && <p className={`text-xs ${inviteMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>{inviteMsg.text}</p>}
              </div>
            )}

            {/* Reset password inline */}
            {resetTarget && (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
                <span className="text-xs text-yellow-400 shrink-0">Reset <span className="font-mono">{resetTarget}</span></span>
                <input type="password" placeholder="New password (min 8 chars)" className="flex-1 px-3 py-1.5 rounded text-xs bg-surface-800 border border-surface-600 outline-none focus:border-yellow-500"
                  style={{ color: "#f1f5f9" }} value={resetPw} onChange={e => setResetPw(e.target.value)} />
                <button onClick={async () => {
                  if (!resetTarget || !resetPw.trim()) return;
                  setResetting(true);
                  try { await api.authAdminResetPassword(resetTarget, resetPw); setResetTarget(null); setResetPw(""); }
                  catch (e) { alert(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed"); }
                  finally { setResetting(false); }
                }} disabled={resetting || resetPw.length < 8}
                  className="px-3 py-1.5 rounded text-xs font-semibold text-yellow-900 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50">
                  {resetting ? "…" : "Set"}
                </button>
                <button onClick={() => setResetTarget(null)} className="text-slate-500 hover:text-slate-300 text-xs">Cancel</button>
              </div>
            )}

            {/* Add user */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Add User</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Username</label>
                  <input className={inputCls} style={{ color: "#f1f5f9" }} value={newUsername}
                    onChange={e => setNewUsername(e.target.value)} placeholder="username" autoComplete="off" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Password</label>
                  <input type="password" className={inputCls} style={{ color: "#f1f5f9" }} value={newPassword}
                    onChange={e => setNewPassword(e.target.value)} placeholder="min 8 chars" autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Role</label>
                  <select className={inputCls} value={newRole} onChange={e => setNewRole(e.target.value as "viewer" | "admin")}
                    style={{ background: "#0d0d1a", color: "#f1f5f9" }}>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Invite email (optional)</label>
                  <input type="email" className={inputCls} style={{ color: "#f1f5f9" }} value={newEmail}
                    onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" autoComplete="off" />
                </div>
              </div>
              <button onClick={async () => {
                setCreateError(null);
                if (!newUsername.trim() || !newPassword.trim()) { setCreateError("Username and password are required"); return; }
                setCreating(true);
                try {
                  await api.authCreateUser({ username: newUsername.trim(), password: newPassword, role: newRole });
                  if (newEmail.trim()) await api.sendInviteEmail(newUsername.trim(), newEmail.trim(), newPassword).catch(() => {});
                  setNewUsername(""); setNewPassword(""); setNewRole("viewer"); setNewEmail("");
                  loadUsers();
                } catch (e) { setCreateError(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed"); }
                finally { setCreating(false); }
              }} disabled={creating} className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {creating ? "Adding…" : "Add User"}
              </button>
              {createError && <p className="text-xs text-red-400 mt-2">{createError}</p>}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
