import { useState } from "react";
import { AlertsResponse, WazuhAlert } from "../../api/client";
import SevBadge from "../SevBadge";
import { format, parseISO } from "date-fns";

interface Props {
  data: AlertsResponse | null;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  hoursBack: number;
  severity: string;
  onSeverityChange: (s: string) => void;
  ruleId: string;
  onRuleIdChange: (r: string) => void;
}

function levelToSeverity(level: number): string {
  if (level >= 15) return "critical";
  if (level >= 12) return "high";
  if (level >= 7)  return "medium";
  return "low";
}

function fmtTime(ts: string): string {
  try { return format(parseISO(ts), "MMM d, yyyy HH:mm:ss"); } catch { return ts; }
}

// Strip redundant backslash escaping from paths returned by the indexer
function cleanPath(s: string): string {
  return s?.replace(/\\\\/g, "\\") ?? s;
}

// Just the executable name from a full path
function exeName(path: string): string {
  const clean = cleanPath(path);
  return clean.split("\\").pop() ?? clean;
}

const ROW_SEV: Record<string, string> = {
  critical: "border-l-2 border-l-red-500 bg-red-500/5",
  high:     "border-l-2 border-l-orange-500 bg-orange-500/5",
  medium:   "border-l-2 border-l-yellow-500 bg-yellow-500/5",
  low:      "",
};

// ── Hash parser ───────────────────────────────────────────────────────────────

function parseHashes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  raw.split(",").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq === -1) return;
    const key = part.slice(0, eq).trim().toUpperCase();
    const val = part.slice(eq + 1).trim();
    if (val) result[key] = val;
  });
  return result;
}

function HashDisplay({ raw }: { raw: string }) {
  const hashes = parseHashes(raw);
  const order = ["SHA256", "MD5", "IMPHASH", "SHA1"];
  const entries = order
    .filter((k) => hashes[k])
    .map((k) => ({ key: k, value: hashes[k] }));
  // include any keys not in our ordered list
  Object.keys(hashes).forEach((k) => {
    if (!order.includes(k)) entries.push({ key: k, value: hashes[k] });
  });
  if (!entries.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-surface-700">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">File Hashes</span>
      <div className="space-y-1.5">
        {entries.map(({ key, value }) => (
          <div key={key} className="flex items-start gap-3 min-w-0">
            <span className="text-slate-500 text-xs w-20 shrink-0">{key}</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-xs font-mono break-all ${key === "SHA256" ? "text-amber-300" : "text-slate-300"}`}>{value}</span>
              {key === "SHA256" && (
                <a
                  href={`https://www.virustotal.com/gui/file/${value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                >
                  VT
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sysmon event-ID → human name + which eventdata fields to surface ──────────
const SYSMON: Record<string, { name: string; fields: { key: string; label: string; isPath?: boolean }[] }> = {
  "1":  { name: "Process Created",
          fields: [
            { key: "commandLine",      label: "Command Line",      isPath: true },
            { key: "image",            label: "Process",           isPath: true },
            { key: "originalFileName", label: "Original Name" },
            { key: "currentDirectory", label: "Working Dir",       isPath: true },
            { key: "integrityLevel",   label: "Integrity Level" },
            { key: "user",             label: "User" },
            { key: "parentCommandLine",label: "Parent Cmd",        isPath: true },
            { key: "parentImage",      label: "Parent Process",    isPath: true },
            { key: "parentUser",       label: "Parent User" },
            { key: "company",          label: "Company" },
            { key: "description",      label: "File Description" },
            { key: "product",          label: "Product" },
            { key: "fileVersion",      label: "File Version" },
          ] },
  "3":  { name: "Network Connection",
          fields: [{ key: "destinationIp",    label: "Destination IP" },
                   { key: "destinationPort",  label: "Dest. Port" },
                   { key: "image",            label: "Process",   isPath: true },
                   { key: "user",             label: "User" }] },
  "5":  { name: "Process Terminated",
          fields: [{ key: "image", label: "Process", isPath: true },
                   { key: "user",  label: "User" }] },
  "7":  { name: "Image (DLL) Loaded",
          fields: [{ key: "imageLoaded", label: "Loaded Image", isPath: true },
                   { key: "image",       label: "Process",      isPath: true },
                   { key: "user",        label: "User" }] },
  "8":  { name: "Remote Thread Created",
          fields: [{ key: "targetImage", label: "Target Process", isPath: true },
                   { key: "image",       label: "Source Process", isPath: true },
                   { key: "user",        label: "User" }] },
  "10": { name: "Process Accessed",
          fields: [{ key: "targetImage", label: "Target Process", isPath: true },
                   { key: "image",       label: "Source Process", isPath: true },
                   { key: "user",        label: "User" }] },
  "11": { name: "File Created",
          fields: [{ key: "targetFilename", label: "Target File",    isPath: true },
                   { key: "image",          label: "Process",        isPath: true },
                   { key: "user",           label: "User" }] },
  "12": { name: "Registry Object Created/Deleted",
          fields: [{ key: "targetObject", label: "Registry Key" },
                   { key: "image",        label: "Process",     isPath: true },
                   { key: "user",         label: "User" }] },
  "13": { name: "Registry Value Set",
          fields: [{ key: "targetObject", label: "Registry Key" },
                   { key: "details",      label: "Value" },
                   { key: "image",        label: "Process",     isPath: true },
                   { key: "user",         label: "User" }] },
  "15": { name: "File Stream Created",
          fields: [{ key: "targetFilename", label: "Target File", isPath: true },
                   { key: "image",          label: "Process",     isPath: true },
                   { key: "user",           label: "User" }] },
  "22": { name: "DNS Query",
          fields: [{ key: "queryName",    label: "Query" },
                   { key: "queryResults", label: "Results" },
                   { key: "image",        label: "Process", isPath: true },
                   { key: "user",         label: "User" }] },
  "23": { name: "File Deleted",
          fields: [{ key: "targetFilename", label: "Deleted File", isPath: true },
                   { key: "image",          label: "Process",      isPath: true },
                   { key: "user",           label: "User" }] },
};

// ── Event detail renderer ─────────────────────────────────────────────────────

function WinEventDetail({ alert }: { alert: WazuhAlert }) {
  const win = alert.data?.win;
  if (!win) return null;

  const evd = win.eventdata ?? {};
  const sys = win.system ?? {};
  const eventId = sys.eventID ?? "";
  const sysmon = SYSMON[eventId];

  const fields = sysmon
    ? sysmon.fields.filter(({ key }) => evd[key])
    : Object.entries(evd)
        .filter(([, v]) => v && v.length < 200)
        .map(([k, v]) => ({ key: k, label: k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()), isPath: k.toLowerCase().includes("file") || k.toLowerCase().includes("image") || k === "targetFilename", value: v }));

  const eventLabel = sysmon?.name ?? (sys.providerName ? `${sys.providerName} Event ${eventId}` : `Event ${eventId}`);

  return (
    <div className="space-y-3">
      {/* Event type header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-300">{eventLabel}</span>
        {eventId && (
          <span className="px-1.5 py-0.5 rounded bg-surface-600 text-slate-400 text-xs font-mono">
            Event ID {eventId}
          </span>
        )}
        {sys.channel && (
          <span className="text-xs text-slate-500">{sys.channel}</span>
        )}
      </div>

      {/* Renamed-exe warning (originalFileName ≠ image exe name) */}
      {eventId === "1" && evd.originalFileName && evd.image && (() => {
        const imgName = exeName(evd.image).toLowerCase();
        const origName = evd.originalFileName.toLowerCase();
        if (origName !== imgName && origName !== "-") {
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-300">
              <span className="text-red-400 font-bold shrink-0">⚠</span>
              <span><span className="font-semibold">Possible renamed executable:</span> running as <span className="font-mono text-red-200">{exeName(evd.image)}</span> but signed as <span className="font-mono text-red-200">{evd.originalFileName}</span></span>
            </div>
          );
        }
        return null;
      })()}

      {/* Key event fields */}
      <div className="grid grid-cols-1 gap-2">
        {(sysmon ? fields as { key: string; label: string; isPath?: boolean }[] : fields as { key: string; label: string; isPath?: boolean; value?: string }[]).map(({ key, label, isPath }) => {
          const raw = evd[key];
          if (!raw) return null;
          const value = cleanPath(raw);
          const display = isPath && value.includes("\\") ? (
            <span title={value} className="font-mono">
              <span className="text-slate-500">{value.substring(0, value.lastIndexOf("\\") + 1)}</span>
              <span className="text-slate-100 font-semibold">{value.split("\\").pop()}</span>
            </span>
          ) : (
            <span className="font-mono text-slate-100">{value}</span>
          );

          return (
            <div key={key} className="flex items-baseline gap-3 min-w-0">
              <span className="text-slate-500 text-xs w-28 shrink-0">{label}</span>
              <span className="text-xs break-all leading-relaxed">{display}</span>
            </div>
          );
        })}
        {evd.processId && (
          <div className="flex items-baseline gap-3">
            <span className="text-slate-500 text-xs w-28 shrink-0">Process ID</span>
            <span className="text-xs font-mono text-slate-300">{evd.processId}</span>
          </div>
        )}
        {evd.utcTime && (
          <div className="flex items-baseline gap-3">
            <span className="text-slate-500 text-xs w-28 shrink-0">Event Time (UTC)</span>
            <span className="text-xs font-mono text-slate-300">{evd.utcTime}</span>
          </div>
        )}
      </div>

      {/* Hashes (Sysmon Event 1 and any other events that carry them) */}
      {evd.hashes && <HashDisplay raw={evd.hashes} />}
    </div>
  );
}

function ScaEventDetail({ alert }: { alert: WazuhAlert }) {
  const sca = alert.data?.sca;
  if (!sca) return null;

  if (sca.type === "summary") {
    const total = parseInt(sca.total_checks ?? "0");
    const passed = parseInt(sca.passed ?? "0");
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{sca.policy}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span><span className="text-slate-500">Score:</span> <span className={`font-bold ${pct < 50 ? "text-red-400" : pct < 75 ? "text-yellow-400" : "text-green-400"}`}>{pct}%</span></span>
          <span><span className="text-green-400 font-semibold">{sca.passed}</span> <span className="text-slate-500">passed</span></span>
          <span><span className="text-red-400 font-semibold">{sca.failed}</span> <span className="text-slate-500">failed</span></span>
          <span><span className="text-slate-400">{sca.total_checks}</span> <span className="text-slate-500">total</span></span>
        </div>
      </div>
    );
  }

  const check = sca.check;
  if (!check) return null;

  const passed = check.result === "passed";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${passed ? "text-green-400 bg-green-500/10 border-green-500/25" : "text-red-400 bg-red-500/10 border-red-500/25"}`}>
          {check.result ?? "unknown"}
        </span>
        {check.previous_result && check.previous_result !== check.result && (
          <span className="text-xs text-slate-500">was: {check.previous_result}</span>
        )}
      </div>
      {check.title && (
        <p className="text-slate-200 text-xs font-medium leading-relaxed">{check.title}</p>
      )}
      {check.rationale && (
        <div>
          <span className="text-slate-500 text-xs block mb-1">Why It Matters</span>
          <p className="text-slate-300 text-xs leading-relaxed">{check.rationale}</p>
        </div>
      )}
      {check.remediation && (
        <div>
          <span className="text-slate-500 text-xs block mb-1">How to Fix</span>
          <p className="text-xs text-slate-300 leading-relaxed bg-green-500/5 rounded-lg px-3 py-2 border border-green-500/15">{check.remediation}</p>
        </div>
      )}
      {check.command && check.command.length > 0 && (
        <div>
          <span className="text-slate-500 text-xs block mb-1">Audit Command</span>
          <pre className="text-xs text-slate-400 font-mono bg-surface-900/80 rounded-lg px-3 py-2 border border-surface-600 overflow-x-auto">{check.command.join("\n")}</pre>
        </div>
      )}
    </div>
  );
}

// ── Compliance badges ─────────────────────────────────────────────────────────

function ComplianceRow({ rule }: { rule: WazuhAlert["rule"] }) {
  const entries: string[] = [];
  const push = (label: string, items?: string[]) =>
    items?.forEach((i) => entries.push(`${label} ${i}`));

  push("PCI DSS",      rule?.pci_dss);
  push("NIST",         rule?.nist_800_53);
  push("GDPR",         rule?.gdpr);
  push("TSC",          rule?.tsc);
  push("CIS",          rule?.cis);
  push("CIS CSC v8",   rule?.cis_csc_v8);
  push("HIPAA",        rule?.hipaa);

  if (!entries.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-slate-500 text-xs shrink-0">Compliance:</span>
      {entries.map((e) => (
        <span key={e} className="px-1.5 py-0.5 rounded-full text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{e}</span>
      ))}
    </div>
  );
}

// ── Expanded alert row ────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: WazuhAlert }) {
  const [expanded, setExpanded] = useState(false);

  const rule   = alert.rule ?? {};
  const level  = rule.level ?? 0;
  const sev    = levelToSeverity(level);
  const mitre  = rule.mitre;
  const hasWin = !!alert.data?.win;
  const hasSca = !!alert.data?.sca;
  const hasMitre = !!(mitre?.technique?.length || mitre?.tactic?.length);

  return (
    <>
      {/* ── Collapsed row ── */}
      <tr
        onClick={() => setExpanded((e) => !e)}
        className={`border-b border-surface-700/50 cursor-pointer transition-colors hover:bg-surface-700/40 ${ROW_SEV[sev] ?? ""} ${expanded ? "bg-surface-700/20" : ""}`}
      >
        <td className="py-2 px-3 text-xs text-slate-400 whitespace-nowrap font-mono">
          {alert.timestamp ? fmtTime(alert.timestamp) : "—"}
        </td>
        <td className="py-2 px-3 text-xs font-medium text-slate-200 whitespace-nowrap">
          {alert.agent?.name ?? "—"}
        </td>
        <td className="py-2 px-3 text-xs font-mono text-accent whitespace-nowrap">
          {rule.id ?? "—"}
        </td>
        <td className="py-2 px-3 text-xs text-slate-300 max-w-sm">
          <span className="truncate block" title={rule.description}>{rule.description ?? "—"}</span>
        </td>
        <td className="py-2 px-3">
          <SevBadge severity={sev} label={String(level)} />
        </td>
        <td className="py-2 px-3 text-center">
          <span className={`text-slate-500 text-xs transition-transform inline-block duration-200 ${expanded ? "rotate-180" : ""}`}>▾</span>
        </td>
      </tr>

      {/* ── Expanded panel ── */}
      {expanded && (
        <tr className="border-b border-surface-600">
          <td colSpan={6} className="bg-surface-900/60 px-5 py-4">
            <div className="space-y-4 max-w-5xl">

              {/* ── Rule summary strip ── */}
              <div className="flex flex-wrap items-start gap-3 pb-3 border-b border-surface-700">
                <SevBadge severity={sev} label={`Level ${level}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 text-sm font-semibold leading-snug">{rule.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className="text-xs text-slate-500">Rule <span className="font-mono text-slate-400">{rule.id}</span></span>
                    {rule.firedtimes != null && rule.firedtimes > 0 && (
                      <span className="text-xs text-slate-500">Fired <span className="text-slate-300">{rule.firedtimes}×</span></span>
                    )}
                    {rule.mail && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Email Notified</span>
                    )}
                    {rule.groups?.map((g) => (
                      <span key={g} className="text-xs px-1.5 py-0.5 rounded bg-surface-600 text-slate-400 font-mono">{g}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── What happened ── */}
              {(hasWin || hasSca) && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {hasWin ? "What Happened" : hasSca ? `SCA — ${alert.data?.sca?.policy ?? "Security Assessment"}` : ""}
                  </h4>
                  <div className="bg-surface-800 rounded-xl border border-surface-600 px-4 py-3">
                    {hasWin && <WinEventDetail alert={alert} />}
                    {hasSca && <ScaEventDetail alert={alert} />}
                  </div>
                </div>
              )}

              {/* ── MITRE ATT&CK ── */}
              {hasMitre && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">MITRE ATT&CK</h4>
                  <div className="bg-blue-500/5 rounded-xl border border-blue-500/20 px-4 py-3 flex flex-wrap gap-4">
                    {mitre?.id?.map((id, i) => (
                      <div key={id} className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded font-mono text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">{id}</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{mitre.technique?.[i] ?? ""}</p>
                          <p className="text-xs text-slate-500">{mitre.tactic?.[i] ?? ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Agent + compliance in one footer row ── */}
              <div className="pt-2 border-t border-surface-700 space-y-2">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                  <span className="text-slate-500">Agent</span>
                  <span className="text-slate-200 font-medium">{alert.agent?.name}</span>
                  <span className="font-mono text-slate-400">{alert.agent?.ip}</span>
                  <span className="text-slate-500 font-mono">ID {alert.agent?.id}</span>
                  {alert.manager?.name && (
                    <>
                      <span className="text-surface-600">·</span>
                      <span className="text-slate-500">Manager</span>
                      <span className="text-slate-400">{alert.manager.name}</span>
                    </>
                  )}
                  {alert.location && (
                    <>
                      <span className="text-surface-600">·</span>
                      <span className="text-slate-500">Source</span>
                      <span className="text-slate-400 font-mono">{alert.location}</span>
                    </>
                  )}
                </div>
                <ComplianceRow rule={rule} />
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export default function AlertTable({
  data, error, page, pageSize, onPageChange,
  hoursBack, severity, onSeverityChange, ruleId, onRuleIdChange,
}: Props) {
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Alerts — Last {hoursBack}h
            {severity && (
              <span className="ml-2 capitalize px-1.5 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent border border-accent/30">
                {severity}
              </span>
            )}
            {data && (
              <span className="ml-2 text-xs text-slate-500">{data.total.toLocaleString()} alerts</span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Click any row to expand</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={severity}
            onChange={(e) => onSeverityChange(e.target.value)}
            className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            type="text"
            placeholder="Rule ID..."
            value={ruleId}
            onChange={(e) => onRuleIdChange(e.target.value)}
            className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-accent w-24"
          />
          {(severity || ruleId) && (
            <button
              onClick={() => { onSeverityChange(""); onRuleIdChange(""); }}
              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-surface-600 hover:border-slate-500 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="text-red-400 text-sm text-center py-8">{error}</div>
      ) : !data ? (
        <div className="space-y-1.5">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-9 rounded" />)}</div>
      ) : data.alerts.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">No alerts match current filters</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-600">
                  <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium whitespace-nowrap">Time</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Agent</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Rule</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Description</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Severity</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-600">
              <span className="text-xs text-slate-500">Page {page + 1} of {totalPages} · {data.total.toLocaleString()} total</span>
              <div className="flex gap-1">
                <button onClick={() => onPageChange(page - 1)} disabled={page === 0} className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed text-xs px-2.5 py-1">← Prev</button>
                <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1} className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed text-xs px-2.5 py-1">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
