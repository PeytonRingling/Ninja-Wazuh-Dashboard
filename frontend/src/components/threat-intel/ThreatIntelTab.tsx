import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api, CveItem, ThreatIntelResponse, DeviceExposure, AppSettings } from "../../api/client";

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: "#ff2d6d",
  high:     "#ff6b35",
  medium:   "#fbbf24",
  low:      "#34d399",
  unknown:  "#5b5a8a",
};

const SEV_BG: Record<string, string> = {
  critical: "rgba(255,45,109,0.12)",
  high:     "rgba(255,107,53,0.12)",
  medium:   "rgba(251,191,36,0.10)",
  low:      "rgba(52,211,153,0.10)",
  unknown:  "rgba(91,90,138,0.12)",
};

const DAY_OPTIONS = [
  { label: "Last 24 h",   value: 1  },
  { label: "Last 7 days", value: 7  },
  { label: "Last 30 days",value: 30 },
  { label: "Last 90 days",value: 90 },
];

const SEV_OPTIONS = ["all", "critical", "high", "medium", "low"];
const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function metricLabel(val: string): string {
  const map: Record<string, string> = {
    NETWORK:   "Network", ADJACENT:  "Adjacent", LOCAL: "Local", PHYSICAL: "Physical",
    LOW:       "Low",     HIGH:      "High",      NONE: "None",
    REQUIRED:  "Required", CHANGED:   "Changed",  UNCHANGED: "Unchanged",
    PARTIAL:   "Partial",  COMPLETE:  "Complete",
  };
  return map[val] ?? val;
}

function metricColor(val: string): string {
  if (["NETWORK", "NONE", "CHANGED", "HIGH", "COMPLETE"].includes(val)) return "#ff6b35";
  if (["LOW", "UNCHANGED"].includes(val)) return "#fbbf24";
  if (["PARTIAL", "ADJACENT"].includes(val)) return "#fbbf24";
  return "#9896c8";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SevBadge({ sev, score }: { sev: string; score?: number }) {
  const c = SEV_COLOR[sev] ?? SEV_COLOR.unknown;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold"
      style={{ background: SEV_BG[sev] ?? SEV_BG.unknown, border: `1px solid ${c}30`, color: c }}
    >
      {sev.toUpperCase()}
      {score !== undefined && <span className="opacity-80">{score.toFixed(1)}</span>}
    </span>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    "Patch Available": { color: "#34d399", bg: "rgba(52,211,153,0.10)" },
    "Workaround Only": { color: "#fbbf24", bg: "rgba(251,191,36,0.10)" },
    "No Fix Available":{ color: "#ff2d6d", bg: "rgba(255,45,109,0.10)" },
  };
  const style = map[effort] ?? { color: "#9896c8", bg: "rgba(91,90,138,0.10)" };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
      style={{ color: style.color, background: style.bg, borderColor: `${style.color}30` }}>
      {effort}
    </span>
  );
}

function CvssRing({ score, sev }: { score: number; sev: string }) {
  const r   = 36;
  const cx  = 44;
  const circ = 2 * Math.PI * r;
  const fill = circ * (score / 10);
  const c   = SEV_COLOR[sev] ?? SEV_COLOR.unknown;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#2d2b55" strokeWidth="7" />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={c} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ filter: `drop-shadow(0 0 6px ${c}80)` }}
        />
        <text x={cx} y={cx + 2} textAnchor="middle" dominantBaseline="middle"
          style={{ fill: c, fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>
          {score.toFixed(1)}
        </text>
      </svg>
      <SevBadge sev={sev} />
    </div>
  );
}

function CvssBreakdown({ detail }: { detail: Record<string, unknown> }) {
  if (!detail.vector) return null;
  const rows: [string, string][] = [
    ["Attack Vector",       detail.attackVector       as string],
    ["Attack Complexity",   detail.attackComplexity   as string],
    ["Privileges Required", detail.privilegesRequired as string],
    ["User Interaction",    detail.userInteraction    as string],
    ["Scope",               detail.scope              as string],
    ["Confidentiality",     detail.confidentiality    as string],
    ["Integrity",           detail.integrity          as string],
    ["Availability",        detail.availability       as string],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return (
    <div>
      <p className="text-[10px] font-mono text-slate-600 mb-2 break-all">{detail.vector as string}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">{label}</span>
            <span className="text-xs font-semibold" style={{ color: metricColor(val) }}>
              {metricLabel(val)}
            </span>
          </div>
        ))}
      </div>
      {!!(detail.exploitabilityScore || detail.impactScore) && (
        <div className="flex gap-6 mt-3 text-xs text-slate-500">
          {!!detail.exploitabilityScore && (
            <span>Exploitability <strong className="text-slate-300">{String(detail.exploitabilityScore)}</strong></span>
          )}
          {!!detail.impactScore && (
            <span>Impact <strong className="text-slate-300">{String(detail.impactScore)}</strong></span>
          )}
        </div>
      )}
    </div>
  );
}

function CveCard({
  cve, onClick,
}: { cve: CveItem; onClick: () => void }) {
  const c = SEV_COLOR[cve.severity] ?? SEV_COLOR.unknown;
  return (
    <button
      onClick={onClick}
      className="card w-full text-left p-5 hover:translate-y-0 transition-all"
      style={{ borderLeft: `3px solid ${c}` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm font-bold text-slate-200">{cve.cve_id}</span>
          <SevBadge sev={cve.severity} score={cve.cvss_score} />
          {cve.has_known_exploit && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,45,109,0.15)", color: "#ff2d6d", border: "1px solid rgba(255,45,109,0.3)" }}>
              EXPLOIT KNOWN
            </span>
          )}
        </div>
        <span className="text-xs text-slate-600 shrink-0">{formatDate(cve.published)}</span>
      </div>

      <p className="text-sm text-slate-400 line-clamp-2 mb-3 leading-relaxed">{cve.description}</p>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        {cve.keyword && (
          <span className="px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent">
            {cve.keyword.split(",")[0].trim()}
          </span>
        )}
        {cve.affected_devices.length > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded font-medium"
            style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {cve.affected_devices.length} device{cve.affected_devices.length !== 1 ? "s" : ""}
          </span>
        )}
        {cve.has_wazuh_coverage ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded font-medium"
            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Wazuh Covered
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-slate-500"
            style={{ background: "rgba(45,43,85,0.5)", border: "1px solid rgba(45,43,85,0.8)" }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            No Coverage
          </span>
        )}
        <EffortBadge effort={cve.remediation_effort} />
        <span className="ml-auto text-accent text-xs font-semibold">Expand →</span>
      </div>
    </button>
  );
}

function CveDrawer({
  cve, onClose, onNavigate,
}: {
  cve: CveItem;
  onClose: () => void;
  onNavigate: (tab: string, deviceSearch?: string) => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const c = SEV_COLOR[cve.severity] ?? SEV_COLOR.unknown;

  const remediationText = () => {
    const kw = cve.keyword?.split(",")[0].trim() || "this software";
    if (cve.remediation_effort === "Patch Available")
      return `Update ${kw} to the latest patched version. Check NinjaOne patch management for available updates and deploy via the Patches tab.`;
    if (cve.remediation_effort === "Workaround Only")
      return `No patch is currently available. Apply the vendor workaround from the advisory links below until a patch is released. Monitor vendor communications for updates.`;
    return `No official fix is currently available. Consider temporary mitigations, network segmentation, or compensating controls. Monitor the NVD entry for updates.`;
  };

  return (
    <div
      className="fixed inset-0 z-[40000] flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[700px] h-full overflow-y-auto flex flex-col"
        style={{
          background: "linear-gradient(180deg, #1a1a3e 0%, #13132b 100%)",
          borderLeft: "1px solid #2d2b55",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
          animation: "slideInRight 0.25s cubic-bezier(0.4,0,0.2,1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 sticky top-0 z-10"
          style={{ background: "#1a1a3e", borderBottom: "1px solid #2d2b55" }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-bold" style={{ color: c }}>{cve.cve_id}</span>
            <SevBadge sev={cve.severity} score={cve.cvss_score} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-surface-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* CVSS Ring + vector */}
          {cve.cvss_score > 0 && (
            <section className="flex items-start gap-6">
              <CvssRing score={cve.cvss_score} sev={cve.severity} />
              <div className="flex-1 pt-1">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">CVSS Breakdown</h3>
                <CvssBreakdown detail={cve.cvss_detail as Record<string, unknown>} />
              </div>
            </section>
          )}

          {/* Description */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{cve.description}</p>
          </section>

          {/* Weaknesses */}
          {cve.weaknesses.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Weaknesses</h3>
              <div className="flex flex-wrap gap-2">
                {cve.weaknesses.map(w => (
                  <span key={w} className="px-2 py-0.5 rounded text-xs font-mono text-slate-400 bg-surface-700 border border-surface-600">{w}</span>
                ))}
              </div>
            </section>
          )}

          {/* Affected Devices */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Affected Devices {cve.affected_devices.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                  {cve.affected_devices.length}
                </span>
              )}
            </h3>
            {cve.affected_devices.length === 0 ? (
              <p className="text-sm text-slate-600 italic">No matching devices found in NinjaOne inventory.</p>
            ) : (
              <div className="space-y-2">
                {cve.affected_devices.map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => onNavigate("ninja", dev.systemName)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-surface-700/60 border border-surface-600"
                    style={{ background: "rgba(26,26,62,0.4)" }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: dev.offline ? "#5b5a8a" : "#34d399",
                               boxShadow: dev.offline ? "none" : "0 0 6px #34d399" }}
                    />
                    <span className="font-medium text-slate-200 flex-1 truncate">{dev.systemName}</span>
                    <span className="text-xs text-slate-500 truncate shrink-0">{dev.os || "—"}</span>
                    <span className="text-xs shrink-0" style={{ color: dev.offline ? "#5b5a8a" : "#34d399" }}>
                      {dev.offline ? "Offline" : "Online"}
                    </span>
                    <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Wazuh Coverage */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Wazuh Coverage</h3>
            {cve.has_wazuh_coverage ? (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
                <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#34d399" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span style={{ color: "#34d399" }}>
                  Wazuh has a rule that references {cve.cve_id}. Exploitation attempts may be detected automatically.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                style={{ background: "rgba(91,90,138,0.12)", border: "1px solid rgba(91,90,138,0.25)" }}>
                <svg className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-slate-500">
                  No Wazuh rule detected for {cve.cve_id} — consider adding a custom rule if exploitation is a risk in your environment.
                </span>
              </div>
            )}
          </section>

          {/* Remediation */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Remediation</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Effort:</span>
                <EffortBadge effort={cve.remediation_effort} />
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{remediationText()}</p>
              {cve.references.filter(r => r.tags?.some(t =>
                ["Patch", "Vendor Advisory", "Mitigation", "Workaround"].includes(t)
              )).slice(0, 3).map(ref => (
                <a key={ref.url} href={ref.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
                  style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "#a855f7" }}>
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span className="truncate">{ref.tags?.join(", ") || "Reference"}</span>
                  <span className="text-slate-600 truncate flex-1">{ref.url}</span>
                </a>
              ))}
            </div>
          </section>

          {/* All References */}
          {cve.references.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                All References ({cve.references.length})
              </h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {cve.references.map(ref => (
                  <a key={ref.url} href={ref.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-400 hover:text-accent transition-colors truncate">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span className="truncate">{ref.url}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Timeline */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Timeline</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-32 shrink-0">Published</span>
                <span className="text-slate-300">{formatDate(cve.published)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-32 shrink-0">Last Modified</span>
                <span className="text-slate-300">{formatDate(cve.last_modified)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 w-32 shrink-0">Status</span>
                <span className="text-slate-300">{cve.vuln_status || "—"}</span>
              </div>
              {cve.has_known_exploit && (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-slate-500 w-32 shrink-0">Exploit Activity</span>
                  <span className="font-semibold" style={{ color: "#ff2d6d" }}>Known exploit detected</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DeviceExposurePanel({ devices }: { devices: DeviceExposure[] }) {
  const [open, setOpen] = useState(false);
  if (devices.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-slate-200">Affected Devices</span>
          <span className="text-xs text-slate-500">{devices.length} device{devices.length !== 1 ? "s" : ""} exposed</span>
        </div>
        <svg className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <div className="rounded-xl overflow-hidden border border-surface-600">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(45,43,85,0.5)" }}>
                  <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">Device</th>
                  <th className="text-left px-4 py-2.5 text-xs text-slate-500 font-semibold">OS</th>
                  <th className="px-4 py-2.5 text-xs text-slate-500 font-semibold text-center">CVEs</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-center" style={{ color: "#ff2d6d" }}>Crit</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-center" style={{ color: "#ff6b35" }}>High</th>
                  <th className="px-4 py-2.5 text-xs font-bold text-center" style={{ color: "#fbbf24" }}>Med</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((exp, i) => (
                  <tr key={exp.device.systemName}
                    className="border-t border-surface-600 hover:bg-surface-700/40 transition-colors"
                    style={i === 0 ? { background: "rgba(255,45,109,0.04)" } : undefined}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: exp.device.offline ? "#5b5a8a" : "#34d399" }} />
                        <span className="font-medium text-slate-200 truncate max-w-[160px]">{exp.device.systemName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 truncate max-w-[120px]">{exp.device.os || "—"}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-300">{exp.cve_count}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: exp.critical > 0 ? "#ff2d6d" : "#3d3b6a" }}>{exp.critical}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: exp.high > 0 ? "#ff6b35" : "#3d3b6a" }}>{exp.high}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: exp.medium > 0 ? "#fbbf24" : "#3d3b6a" }}>{exp.medium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonFeed() {
  return (
    <div className="space-y-3">
      {[120, 100, 140, 100, 120].map((h, i) => (
        <div key={i} className="skeleton rounded-2xl" style={{ height: h }} />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (tab: string, deviceSearch?: string) => void;
}

export default function ThreatIntelTab({ onNavigate }: Props) {
  const [data, setData]             = useState<ThreatIntelResponse | null>(null);
  const [settings, setSettings]     = useState<AppSettings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selectedCve, setSelectedCve] = useState<CveItem | null>(null);

  // Filters (all client-side except days_back which changes what NVD returns)
  const [daysBack,      setDaysBack]      = useState(7);
  const [filterSev,     setFilterSev]     = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("all");
  const [filterDevices, setFilterDevices] = useState(false);
  const [search,        setSearch]        = useState("");
  const [page,          setPage]          = useState(0);

  // Notification dedup
  const notifiedCves = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      await api.refreshThreatIntel().catch(() => {});
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [res, sett] = await Promise.all([
        api.getThreatIntelCves({ days_back: daysBack }),
        settings ? Promise.resolve(settings) : api.getSettings(),
      ]);
      setData(res);
      if (!settings) setSettings(sett as AppSettings);

      // Browser notifications for new critical CVEs affecting devices
      if (Notification.permission === "granted") {
        res.cves.forEach(cve => {
          if (cve.severity === "critical" && cve.affected_devices.length > 0
              && !notifiedCves.current.has(cve.cve_id)) {
            notifiedCves.current.add(cve.cve_id);
            new Notification(`New Critical CVE: ${cve.cve_id}`, {
              body: `Affects ${cve.affected_devices.length} device${cve.affected_devices.length !== 1 ? "s" : ""} in your inventory.`,
              icon: "/favicon.ico",
              tag: `cve-${cve.cve_id}`,
            });
          }
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CVE data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysBack]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when days_back changes
  useEffect(() => {
    if (data !== null) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysBack]);

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!data) return [];
    let cves = data.cves;

    // Date filter: the API already honours days_back; additionally enforce client-side for 24h
    if (daysBack === 1) {
      const cutoff = Date.now() - 86400_000;
      cves = cves.filter(c => new Date(c.published).getTime() >= cutoff);
    }

    if (filterSev !== "all")
      cves = cves.filter(c => c.severity === filterSev);

    if (filterKeyword !== "all")
      cves = cves.filter(c =>
        c.keyword.toLowerCase().includes(filterKeyword.toLowerCase()));

    if (filterDevices)
      cves = cves.filter(c => c.affected_devices.length > 0);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      cves = cves.filter(c =>
        c.cve_id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.keyword.toLowerCase().includes(q));
    }

    return cves;
  }, [data, daysBack, filterSev, filterKeyword, filterDevices, search]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [filterSev, filterKeyword, filterDevices, search, daysBack]);

  const enabledKeywords = useMemo(() => {
    const kws: string[] = [];
    try {
      const parsed = settings?.cve_keywords ?? [];
      parsed.forEach(k => { if (k.enabled) kws.push(k.keyword); });
    } catch {}
    return kws;
  }, [settings]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-10 relative">
      {selectedCve && (
        <CveDrawer
          cve={selectedCve}
          onClose={() => setSelectedCve(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Threat Intelligence</h1>
          <p className="text-xs text-slate-500 mt-0.5">CVE feed from NIST NVD · filtered by your configured keywords</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-slate-600">
              Updated {relativeTime(data.last_updated)}
              {data.fetch_errors.length > 0 && (
                <span className="ml-2 text-[#fbbf24]" title={data.fetch_errors.join("; ")}>
                  ⚠ {data.fetch_errors.length} keyword{data.fetch_errors.length !== 1 ? "s" : ""} failed
                </span>
              )}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 text-slate-300 border-surface-600 bg-surface-700 hover:bg-surface-600"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(["critical", "high", "medium", "low"] as const).map(sev => {
            const count = data[`total_${sev}` as keyof ThreatIntelResponse] as number;
            return (
              <button
                key={sev}
                onClick={() => setFilterSev(f => f === sev ? "all" : sev)}
                className="card px-4 py-3 text-left transition-all hover:scale-[1.01]"
                style={filterSev === sev ? { borderColor: SEV_COLOR[sev], boxShadow: `0 0 12px ${SEV_COLOR[sev]}40` } : {}}
              >
                <div className="text-2xl font-bold" style={{ color: SEV_COLOR[sev] }}>{count}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{sev}</div>
              </button>
            );
          })}
          <div className="card px-4 py-3">
            <div className="text-2xl font-bold" style={{ color: "#fbbf24" }}>{data.total_affecting_devices}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Affecting Devices</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        {/* Severity pills */}
        <div className="flex gap-1">
          {SEV_OPTIONS.map(s => (
            <button key={s}
              onClick={() => setFilterSev(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${filterSev === s ? "" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              style={filterSev === s && s !== "all" ? {
                background: SEV_BG[s], borderColor: `${SEV_COLOR[s]}40`, color: SEV_COLOR[s]
              } : filterSev === s ? {
                background: "rgba(124,58,237,0.12)", borderColor: "rgba(124,58,237,0.3)", color: "#a855f7"
              } : {}}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-surface-600 hidden sm:block" />

        {/* Date range */}
        <select value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-xs bg-surface-700 border border-surface-600 text-slate-300 focus:outline-none focus:border-accent/60">
          {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Keyword */}
        <select value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-surface-700 border border-surface-600 text-slate-300 focus:outline-none focus:border-accent/60">
          <option value="all">All Keywords</option>
          {enabledKeywords.map(kw => <option key={kw} value={kw}>{kw}</option>)}
        </select>

        {/* Devices toggle */}
        <button onClick={() => setFilterDevices(d => !d)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors`}
          style={filterDevices ? {
            background: "rgba(251,191,36,0.10)", borderColor: "rgba(251,191,36,0.3)", color: "#fbbf24"
          } : { borderColor: "#2d2b55", color: "#5b5a8a" }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Affects My Devices
        </button>

        {/* Search */}
        <div className="relative ml-auto">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search CVE ID or keyword…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-surface-700 border border-surface-600 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/60 w-52"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <div className="text-center text-xs text-slate-600 py-2">
            Fetching CVE data from NIST NVD — this may take 15–30 seconds on first load…
          </div>
          <SkeletonFeed />
        </div>
      ) : error ? (
        <div className="card p-6 text-center text-red-400 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-500 text-sm">No CVEs match your current filters.</p>
          {!data?.cves.length && (
            <p className="text-xs text-slate-600 mt-2">
              Check that CVE keywords are enabled in Settings and try refreshing.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>{filtered.length} CVE{filtered.length !== 1 ? "s" : ""}</span>
              <span>Page {page + 1} of {totalPages}</span>
            </div>
            {paginated.map(cve => (
              <CveCard key={cve.cve_id} cve={cve} onClick={() => setSelectedCve(cve)} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-700 border border-surface-600 text-slate-300 disabled:opacity-40 hover:bg-surface-600 transition-colors">
                ← Prev
              </button>
              <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-700 border border-surface-600 text-slate-300 disabled:opacity-40 hover:bg-surface-600 transition-colors">
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Device Exposure Panel */}
      {data && <DeviceExposurePanel devices={data.device_exposure} />}
    </div>
  );
}
