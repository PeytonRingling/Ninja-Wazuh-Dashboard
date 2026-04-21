import { useState, useEffect, useRef } from "react";
import { api, AppSettings, CveKeyword, ConnectionTestResult, UserAccount } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

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
  const { user: currentUser, logout } = useAuth();
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

      {/* ── SMTP ─────────────────────────────────────────────────────────────── */}
      <SmtpSettings draft={draft} patch={patch} />

      {/* ── User Management ─────────────────────────────────────────────────── */}
      <UserManagement currentUser={currentUser} onLogout={logout} />

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

// ── User Management ────────────────────────────────────────────────────────────

function UserManagement({
  currentUser,
  onLogout,
}: {
  currentUser: { username: string; role: string } | null;
  onLogout: () => void;
}) {
  const isAdmin = currentUser?.role === "admin";

  const [users, setUsers]           = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUsername, setNewUsername]   = useState("");
  const [newPassword, setNewPassword]   = useState("");
  const [newRole, setNewRole]           = useState<"viewer" | "admin">("viewer");
  const [newEmail, setNewEmail]         = useState("");
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ username: string; password: string } | null>(null);
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviting, setInviting]         = useState(false);
  const [inviteMsg, setInviteMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [ownCurrent, setOwnCurrent]     = useState("");
  const [ownNew, setOwnNew]             = useState("");
  const [ownNew2, setOwnNew2]           = useState("");
  const [changingPw, setChangingPw]     = useState(false);
  const [pwMsg, setPwMsg]               = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [resetTarget, setResetTarget]   = useState<string | null>(null);
  const [resetPw, setResetPw]           = useState("");
  const [resetting, setResetting]       = useState(false);

  const loadUsers = () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    api.authListUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => { loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setCreateError(null);
    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError("Username and password are required"); return;
    }
    setCreating(true);
    try {
      await api.authCreateUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      if (newEmail.trim()) {
        await api.sendInviteEmail(newUsername.trim(), newEmail.trim(), newPassword).catch(() => {});
      }
      setNewUsername(""); setNewPassword(""); setNewRole("viewer"); setNewEmail("");
      loadUsers();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    await api.authDeleteUser(username).catch(() => {});
    loadUsers();
  };

  const handleSendInvite = async () => {
    if (!inviteTarget || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await api.sendInviteEmail(inviteTarget.username, inviteEmail.trim(), inviteTarget.password);
      setInviteMsg({ type: "ok", text: `Invite sent to ${inviteEmail}` });
      setTimeout(() => { setInviteTarget(null); setInviteEmail(""); setInviteMsg(null); }, 2000);
    } catch (e) {
      setInviteMsg({ type: "err", text: e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed to send" });
    } finally {
      setInviting(false);
    }
  };

  const handleResetPw = async () => {
    if (!resetTarget || !resetPw.trim()) return;
    setResetting(true);
    try {
      await api.authAdminResetPassword(resetTarget, resetPw);
      setResetTarget(null); setResetPw("");
    } catch (e) {
      alert(e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed");
    } finally {
      setResetting(false);
    }
  };

  const handleChangePw = async () => {
    setPwMsg(null);
    if (ownNew !== ownNew2) { setPwMsg({ type: "err", text: "New passwords do not match" }); return; }
    setChangingPw(true);
    try {
      await api.authChangeOwnPassword(ownCurrent, ownNew);
      setOwnCurrent(""); setOwnNew(""); setOwnNew2("");
      setPwMsg({ type: "ok", text: "Password changed successfully" });
    } catch (e) {
      setPwMsg({ type: "err", text: e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed" });
    } finally {
      setChangingPw(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm text-slate-100 outline-none bg-surface-900 border border-surface-600 focus:border-accent transition-colors";

  return (
    <div className="space-y-4">
      {/* ── Change own password ──────────────────────────────────────────────── */}
      <SectionCard
        title="Change Password"
        description={`Changing password for ${currentUser?.username}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Current password</label>
            <input type="password" className={inputCls} value={ownCurrent}
              onChange={e => setOwnCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">New password</label>
            <input type="password" className={inputCls} value={ownNew}
              onChange={e => setOwnNew(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirm new password</label>
            <input type="password" className={inputCls} value={ownNew2}
              onChange={e => setOwnNew2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {pwMsg && (
          <p className={`text-xs mt-1 ${pwMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>
            {pwMsg.text}
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleChangePw}
            disabled={changingPw || !ownCurrent || !ownNew || !ownNew2}
            className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {changingPw ? "Updating…" : "Update Password"}
          </button>
          <button
            onClick={onLogout}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </SectionCard>

      {/* ── Admin: manage users ───────────────────────────────────────────────── */}
      {isAdmin && (
        <SectionCard
          title="User Management"
          description="Add or remove dashboard users. Admins can manage users; viewers have read-only access."
        >
          {/* User list */}
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
                        <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}>you</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        u.role === "admin"
                          ? "bg-accent/15 text-accent"
                          : "bg-slate-700/40 text-slate-400"
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setInviteTarget({ username: u.username, password: "" }); setInviteEmail(""); setInviteMsg(null); }}
                          className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors"
                        >
                          Invite
                        </button>
                        <button
                          onClick={() => { setResetTarget(u.username); setResetPw(""); }}
                          className="text-[10px] text-slate-500 hover:text-yellow-400 transition-colors"
                        >
                          Reset pw
                        </button>
                        {u.username !== currentUser?.username && (
                          <button
                            onClick={() => handleDelete(u.username)}
                            className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reset password modal inline */}
          {resetTarget && (
            <div className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
              <span className="text-xs text-yellow-400 shrink-0">Reset <span className="font-mono">{resetTarget}</span></span>
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                className="flex-1 px-3 py-1.5 rounded text-xs text-slate-100 bg-surface-900 border border-surface-600 outline-none focus:border-yellow-500"
                value={resetPw}
                onChange={e => setResetPw(e.target.value)}
              />
              <button
                onClick={handleResetPw}
                disabled={resetting || resetPw.length < 8}
                className="px-3 py-1.5 rounded text-xs font-semibold text-yellow-900 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 transition-colors"
              >
                {resetting ? "…" : "Set"}
              </button>
              <button onClick={() => setResetTarget(null)} className="text-slate-500 hover:text-slate-300 text-xs">Cancel</button>
            </div>
          )}

          {/* Invite panel */}
          {inviteTarget && (
            <div className="flex flex-col gap-2 p-3 rounded-lg"
              style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-400 shrink-0">
                  Invite <span className="font-mono">{inviteTarget.username}</span>
                </span>
                <input
                  type="email"
                  placeholder="Recipient email"
                  className="flex-1 px-3 py-1.5 rounded text-xs text-slate-100 bg-surface-900 border border-surface-600 outline-none focus:border-purple-500"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Their password (for email)"
                  className="flex-1 px-3 py-1.5 rounded text-xs text-slate-100 bg-surface-900 border border-surface-600 outline-none focus:border-purple-500"
                  value={inviteTarget.password}
                  onChange={e => setInviteTarget(t => t ? { ...t, password: e.target.value } : t)}
                />
                <button
                  onClick={handleSendInvite}
                  disabled={inviting || !inviteEmail || !inviteTarget.password}
                  className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                  style={{ background: "#7c3aed" }}
                >
                  {inviting ? "…" : "Send"}
                </button>
                <button onClick={() => setInviteTarget(null)} className="text-slate-500 hover:text-slate-300 text-xs">Cancel</button>
              </div>
              {inviteMsg && (
                <p className={`text-xs ${inviteMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>{inviteMsg.text}</p>
              )}
            </div>
          )}

          {/* Add user form */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Add User</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-32">
                <label className="block text-[10px] text-slate-500 mb-1">Username</label>
                <input className={inputCls} value={newUsername}
                  onChange={e => setNewUsername(e.target.value)} placeholder="username" autoComplete="off" />
              </div>
              <div className="flex-1 min-w-32">
                <label className="block text-[10px] text-slate-500 mb-1">Password</label>
                <input type="password" className={inputCls} value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} placeholder="min 8 chars" autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Role</label>
                <select
                  className={inputCls + " pr-8"}
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as "viewer" | "admin")}
                  style={{ background: "#0d0d1a" }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-end mt-2">
              <div className="flex-1 min-w-48">
                <label className="block text-[10px] text-slate-500 mb-1">Send invite email to (optional)</label>
                <input type="email" className={inputCls} value={newEmail}
                  onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" autoComplete="off" />
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {creating ? "Adding…" : "Add User"}
              </button>
            </div>
            {createError && <p className="text-xs text-red-400 mt-1.5">{createError}</p>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── SMTP Settings ──────────────────────────────────────────────────────────────

function SmtpSettings({
  draft,
  patch,
}: {
  draft: AppSettings | null;
  patch: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  const [testEmail, setTestEmail]   = useState("");
  const [testing, setTesting]       = useState(false);
  const [testMsg, setTestMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);

  if (!draft) return null;

  const handleTest = async () => {
    if (!testEmail.trim()) return;
    setTesting(true);
    setTestMsg(null);
    try {
      await api.sendTestEmail(testEmail.trim());
      setTestMsg({ type: "ok", text: `Test email sent to ${testEmail}` });
    } catch (e) {
      setTestMsg({ type: "err", text: e instanceof Error ? e.message.replace(/^\d+: /, "") : "Failed" });
    } finally {
      setTesting(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm text-slate-100 outline-none bg-surface-900 border border-surface-600 focus:border-accent transition-colors";

  return (
    <SectionCard
      title="SMTP / Email"
      description="Used for user invites and future alert notifications. Supports any SMTP provider (Gmail, Outlook, Postfix, etc.)"
    >
      <Toggle
        label="Enable SMTP"
        description="Send invite and alert emails"
        checked={draft.smtp_enabled}
        onChange={v => patch("smtp_enabled", v)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div>
          <label className="block text-xs text-slate-500 mb-1">SMTP Host</label>
          <input className={inputCls} value={draft.smtp_host}
            onChange={e => patch("smtp_host", e.target.value)}
            placeholder="smtp.gmail.com" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Port</label>
          <input type="number" className={inputCls} value={draft.smtp_port}
            onChange={e => patch("smtp_port", Number(e.target.value))}
            placeholder="587" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Username</label>
          <input className={inputCls} value={draft.smtp_username}
            onChange={e => patch("smtp_username", e.target.value)}
            placeholder="you@example.com" autoComplete="off" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Password</label>
          <input type="password" className={inputCls} value={draft.smtp_password}
            onChange={e => patch("smtp_password", e.target.value)}
            autoComplete="new-password" placeholder="App password or SMTP password" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">From Address</label>
          <input type="email" className={inputCls} value={draft.smtp_from_email}
            onChange={e => patch("smtp_from_email", e.target.value)}
            placeholder="dashboard@example.com" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">From Name</label>
          <input className={inputCls} value={draft.smtp_from_name}
            onChange={e => patch("smtp_from_name", e.target.value)}
            placeholder="OPS Dashboard" />
        </div>
      </div>

      <Toggle
        label="Use STARTTLS"
        description="Recommended for port 587. Disable for port 465 (SSL) or unencrypted."
        checked={draft.smtp_tls}
        onChange={v => patch("smtp_tls", v)}
      />

      {/* Test email */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Send Test Email</p>
        <div className="flex gap-2 items-center">
          <input
            type="email"
            className={inputCls}
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="your@email.com"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testEmail.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-surface-600 text-slate-300 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {testing ? "Sending…" : "Send Test"}
          </button>
        </div>
        {testMsg && (
          <p className={`text-xs mt-1.5 ${testMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>
            {testMsg.text}
          </p>
        )}
        <p className="text-[11px] text-slate-600 mt-1.5">
          Save your settings first, then send a test to verify everything works.
        </p>
      </div>
    </SectionCard>
  );
}
