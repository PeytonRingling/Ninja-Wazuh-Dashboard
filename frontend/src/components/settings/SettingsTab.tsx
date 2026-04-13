import { useState, useEffect, useRef } from "react";
import { api, AppSettings, CveKeyword, ConnectionTestResult } from "../../api/client";

// ── Small primitives ───────────────────────────────────────────────────────────

function SectionCard({
  title, description, children,
}: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-200">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  label, description, checked, onChange,
}: {
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
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
          checked ? "bg-accent" : "bg-surface-600"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </div>
  );
}

function NumberField({
  label, description, value, onChange, min, max, unit,
}: {
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
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(Number(e.target.value))}
          className="w-20 text-right px-2 py-1.5 rounded-lg text-sm bg-surface-700 border border-surface-600 text-slate-200 focus:outline-none focus:border-accent/60 tabular-nums"
        />
        {unit && <span className="text-xs text-slate-500 w-14">{unit}</span>}
      </div>
    </div>
  );
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  const ok = result.status === "connected";
  return (
    <div
      className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
      style={ok ? {
        background: "rgba(52,211,153,0.08)",
        border: "1px solid rgba(52,211,153,0.25)",
        color: "#34d399",
      } : {
        background: "rgba(255,45,109,0.08)",
        border: "1px solid rgba(255,45,109,0.25)",
        color: "#ff2d6d",
      }}
    >
      <span className="font-semibold">{ok ? "Connected" : "Failed"}</span>
      {result.latency_ms !== undefined && (
        <span className="opacity-70">· {result.latency_ms} ms</span>
      )}
      {result.error && (
        <span className="opacity-70 truncate">· {result.error}</span>
      )}
    </div>
  );
}

function Toast({ type, msg, onClose }: { type: "success" | "error"; msg: string; onClose: () => void }) {
  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium"
      style={type === "success" ? {
        background: "rgba(13,20,15,0.97)",
        border: "1px solid rgba(52,211,153,0.4)",
        color: "#34d399",
      } : {
        background: "rgba(20,13,15,0.97)",
        border: "1px solid rgba(255,45,109,0.4)",
        color: "#ff2d6d",
      }}
    >
      {type === "success" ? (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      )}
      {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100 transition-opacity">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SettingsTab() {
  const [original, setOriginal] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [wazuhTest, setWazuhTest] = useState<ConnectionTestResult | null>(null);
  const [ninjaTest, setNinjaTest] = useState<ConnectionTestResult | null>(null);
  const [wazuhTesting, setWazuhTesting] = useState(false);
  const [ninjaTesting, setNinjaTesting] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = !!(original && draft && JSON.stringify(draft) !== JSON.stringify(original));

  useEffect(() => {
    api.getSettings()
      .then(s => { setOriginal(s); setDraft(s); })
      .catch(e => setLoadError(e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
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
      showToast("success", "Settings saved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (isDirty && !confirm("Discard unsaved changes?")) return;
    setDraft(original);
  }

  async function handleTestWazuh() {
    setWazuhTesting(true);
    setWazuhTest(null);
    try { setWazuhTest(await api.testWazuhConnection()); }
    finally { setWazuhTesting(false); }
  }

  async function handleTestNinja() {
    setNinjaTesting(true);
    setNinjaTest(null);
    try { setNinjaTest(await api.testNinjaConnection()); }
    finally { setNinjaTesting(false); }
  }

  function addKeyword() {
    const kw = newKeyword.trim();
    if (!kw || !draft) return;
    if (draft.cve_keywords.some(k => k.keyword.toLowerCase() === kw.toLowerCase())) return;
    patch("cve_keywords", [...draft.cve_keywords, { keyword: kw, enabled: true }]);
    setNewKeyword("");
  }

  function removeKeyword(idx: number) {
    if (!draft) return;
    patch("cve_keywords", draft.cve_keywords.filter((_, i) => i !== idx));
  }

  function toggleKeyword(idx: number) {
    if (!draft) return;
    patch("cve_keywords", draft.cve_keywords.map((k: CveKeyword, i: number) =>
      i === idx ? { ...k, enabled: !k.enabled } : k
    ));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pt-2">
        {[160, 200, 280, 160, 120].map((h, i) => (
          <div key={i} className="skeleton rounded-2xl" style={{ height: h }} />
        ))}
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div className="max-w-3xl mx-auto card p-6 text-center">
        <p className="text-sm text-red-400">Failed to load settings: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-32">
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-xs text-slate-500 mt-1">Configure dashboard behaviour and integrations. Changes are saved to the local SQLite database.</p>
      </div>

      {/* ── API Credentials ─────────────────────────────────────────────────── */}
      <SectionCard
        title="API Credentials"
        description="Connection details are loaded from the .env file at startup and cannot be changed here."
      >
        {/* Wazuh */}
        <div className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Wazuh SIEM</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 rounded-lg text-sm font-mono text-slate-400 truncate bg-surface-700 border border-surface-600">
              {draft.wazuh_url_display || "—"}
            </div>
            <button
              onClick={handleTestWazuh}
              disabled={wazuhTesting}
              className="btn-primary px-4 py-2 text-xs shrink-0 disabled:opacity-50"
            >
              {wazuhTesting ? "Testing…" : "Test"}
            </button>
          </div>
          {wazuhTest && <TestResult result={wazuhTest} />}
        </div>

        <div className="border-t border-surface-600" />

        {/* NinjaOne */}
        <div className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a855f7" }}>NinjaOne RMM</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 rounded-lg text-sm font-mono text-slate-400 truncate bg-surface-700 border border-surface-600">
              {draft.ninja_url_display || "—"}
            </div>
            <button
              onClick={handleTestNinja}
              disabled={ninjaTesting}
              className="btn-primary px-4 py-2 text-xs shrink-0 disabled:opacity-50"
            >
              {ninjaTesting ? "Testing…" : "Test"}
            </button>
          </div>
          {ninjaTest && <TestResult result={ninjaTest} />}
        </div>
      </SectionCard>

      {/* ── Notification Preferences ─────────────────────────────────────────── */}
      <SectionCard
        title="Notification Preferences"
        description="Browser push notifications for new Wazuh alerts. Requires notification permission to be granted."
      >
        <Toggle
          label="Enable browser notifications"
          checked={draft.notifications_enabled}
          onChange={v => patch("notifications_enabled", v)}
        />
        <div
          className={`space-y-3 pl-4 border-l-2 border-surface-600 transition-opacity duration-150 ${
            !draft.notifications_enabled ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <Toggle label="Notify on critical alerts" checked={draft.notify_critical} onChange={v => patch("notify_critical", v)} />
          <Toggle label="Notify on high alerts"     checked={draft.notify_high}     onChange={v => patch("notify_high",     v)} />
          <Toggle label="Notify on medium alerts"   checked={draft.notify_medium}   onChange={v => patch("notify_medium",   v)} />
          <Toggle label="Notify on low alerts"      checked={draft.notify_low}      onChange={v => patch("notify_low",      v)} />
          <NumberField
            label="Cooldown between notifications"
            description="Minimum time before sending another notification for the same severity."
            value={draft.notification_cooldown}
            onChange={v => patch("notification_cooldown", v)}
            min={1} max={1440} unit="minutes"
          />
        </div>
      </SectionCard>

      {/* ── Alert Thresholds ─────────────────────────────────────────────────── */}
      <SectionCard
        title="Alert Thresholds"
        description="Colour breakpoints used in agent status grids and fleet health indicators."
      >
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Agent Activity</div>
        <NumberField label="Green threshold"  value={draft.agent_green_minutes}  onChange={v => patch("agent_green_minutes",  v)} min={1} unit="minutes" />
        <NumberField label="Yellow threshold" value={draft.agent_yellow_minutes} onChange={v => patch("agent_yellow_minutes", v)} min={1} unit="minutes" />

        <div className="border-t border-surface-600 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Device Offline</div>
          <NumberField label="Yellow threshold" value={draft.offline_yellow_hours} onChange={v => patch("offline_yellow_hours", v)} min={1} unit="hours" />
          <NumberField label="Orange threshold" value={draft.offline_orange_hours} onChange={v => patch("offline_orange_hours", v)} min={1} unit="hours" />
        </div>

        <div className="border-t border-surface-600 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Fleet Health Ring</div>
          <NumberField label="Green threshold" value={draft.fleet_green_pct} onChange={v => patch("fleet_green_pct", v)} min={0} max={100} unit="%" />
          <NumberField label="Amber threshold" value={draft.fleet_amber_pct} onChange={v => patch("fleet_amber_pct", v)} min={0} max={100} unit="%" />
        </div>

        <div className="border-t border-surface-600 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Patch Age</div>
          <NumberField label="Yellow threshold" value={draft.patch_yellow_days} onChange={v => patch("patch_yellow_days", v)} min={1} unit="days" />
          <NumberField label="Orange threshold" value={draft.patch_orange_days} onChange={v => patch("patch_orange_days", v)} min={1} unit="days" />
        </div>
      </SectionCard>

      {/* ── CVE Keyword Filters ──────────────────────────────────────────────── */}
      <SectionCard
        title="CVE Keyword Filters"
        description="Keywords used to scope CVE searches. Click a keyword to toggle it on or off."
      >
        <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
          {draft.cve_keywords.map((kw: CveKeyword, i: number) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
              style={kw.enabled ? {
                background: "rgba(124,58,237,0.14)",
                border: "1px solid rgba(124,58,237,0.32)",
                color: "#a855f7",
              } : {
                background: "rgba(45,43,85,0.5)",
                border: "1px solid rgba(45,43,85,0.8)",
                color: "#5b5a8a",
              }}
            >
              <button onClick={() => toggleKeyword(i)} className="hover:opacity-80 transition-opacity">
                {kw.keyword}
              </button>
              <button
                onClick={() => removeKeyword(i)}
                className="text-slate-600 hover:text-slate-400 transition-colors ml-0.5"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {draft.cve_keywords.length === 0 && (
            <span className="text-xs text-slate-600 italic">No keywords configured.</span>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            placeholder="Add keyword…"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-surface-700 border border-surface-600 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/60"
          />
          <button onClick={addKeyword} className="btn-primary px-4 py-1.5 text-xs shrink-0">
            Add
          </button>
        </div>
      </SectionCard>

      {/* ── UI Preferences ───────────────────────────────────────────────────── */}
      <SectionCard title="UI Preferences">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <label className="text-sm text-slate-300 font-medium block mb-1.5">Default theme</label>
            <select
              value={draft.default_theme}
              onChange={e => patch("default_theme", e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm bg-surface-700 border border-surface-600 text-slate-200 focus:outline-none focus:border-accent/60"
            >
              <option value="dark">Dark (Midnight Purple)</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-300 font-medium block mb-1.5">Default time window</label>
            <select
              value={draft.default_time_window}
              onChange={e => patch("default_time_window", e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm bg-surface-700 border border-surface-600 text-slate-200 focus:outline-none focus:border-accent/60"
            >
              {["1h", "3h", "6h", "12h", "24h"].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 pt-1">
          <NumberField
            label="Auto-refresh interval"
            value={draft.auto_refresh_interval}
            onChange={v => patch("auto_refresh_interval", v)}
            min={10} max={3600} unit="seconds"
          />
          <NumberField
            label="Noisy rules page size"
            value={draft.noisy_rules_page_size}
            onChange={v => patch("noisy_rules_page_size", v)}
            min={5} max={200} unit="rows"
          />
          <NumberField
            label="Alerts page size"
            value={draft.alerts_page_size}
            onChange={v => patch("alerts_page_size", v)}
            min={5} max={200} unit="rows"
          />
        </div>
      </SectionCard>

      {/* ── Sticky save bar ──────────────────────────────────────────────────── */}
      {isDirty && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-8 py-4"
          style={{
            background: "linear-gradient(to top, #0d0d1a 70%, rgba(13,13,26,0))",
            borderTop: "1px solid #2d2b55",
          }}
        >
          <span className="text-xs text-slate-500">Unsaved changes</span>
          <div className="flex gap-3">
            <button
              onClick={handleDiscard}
              className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors text-slate-300 border-surface-600 bg-surface-700 hover:bg-surface-600"
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
    </div>
  );
}
