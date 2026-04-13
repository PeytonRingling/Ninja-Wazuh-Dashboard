import React from "react";

function KbdBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-0.5 rounded bg-surface-700 border border-surface-500 text-slate-300 font-mono text-[11px] shrink-0">
      {children}
    </kbd>
  );
}

function TabCard({
  icon, title, children,
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}>
          <span className="text-accent">{icon}</span>
        </div>
        <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
      </div>
      <div className="text-sm text-slate-500 leading-relaxed">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center"
        style={{ background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.35)", color: "#a855f7" }}
      >
        {n}
      </span>
      <div className="text-sm text-slate-400 pt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}

export default function GuideTab() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">

      {/* Hero */}
      <div
        className="card p-8 text-center"
        style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.10), rgba(168,85,247,0.05))" }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.28), rgba(168,85,247,0.14))",
            border: "1px solid rgba(124,58,237,0.4)",
            boxShadow: "0 0 24px rgba(124,58,237,0.2)",
          }}
        >
          <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Dashboard Guide</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
          A unified view of your Wazuh SIEM and NinjaOne RMM environments. Use this guide to get the most out of every section.
        </p>
      </div>

      {/* Tab overview */}
      <section>
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Dashboard Sections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TabCard
            title="Home"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
          >
            Live status pills, 24h alert sparkline, device connectivity bar, fleet score ring, and recent critical alerts feed. Your starting point for situational awareness.
          </TabCard>
          <TabCard
            title="Endpoint Intel"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            }
          >
            Correlated view joining NinjaOne devices with Wazuh agents by hostname. Filter by risk category — Critical, Offline+Alerts, No SIEM Coverage, Not in RMM, Healthy.
          </TabCard>
          <TabCard
            title="Threat Intel"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          >
            CVE feed pulled from the NIST NVD API, filtered by the keywords you configure in Settings. Cross-references vulnerabilities against your NinjaOne device inventory and checks Wazuh rule coverage.
          </TabCard>
          <TabCard
            title="Wazuh SIEM"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          >
            Alert volume charts, noisy rules analysis, quick-suppress workflow, severity donut, paginated alert table with full detail expansion, and agent status grid.
          </TabCard>
          <TabCard
            title="NinjaOne RMM"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          >
            Device health grid, patch compliance summary, and recent activity feed. Patches are sorted oldest-first to surface stale unpatched systems immediately.
          </TabCard>
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section>
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Keyboard Shortcuts</h2>
        <div className="card p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3">
            {([
              ["H", "Jump to Home"],
              ["W", "Jump to Wazuh SIEM"],
              ["N", "Jump to NinjaOne RMM"],
              ["E", "Jump to Endpoint Intel"],
              ["T", "Jump to Threat Intel"],
              ["G", "Jump to this Guide"],
              ["S", "Jump to Settings"],
              ["R", "Refresh summary data"],
              ["D", "Toggle dark / light mode"],
              ["Ctrl+K", "Open global search"],
              ["?", "Toggle shortcuts reference"],
              ["Escape", "Close drawers / search"],
            ] as [string, string][]).map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-400">{desc}</span>
                <KbdBadge>{key}</KbdBadge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Threat Intel section */}
      <section>
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Using the Threat Intel Tab</h2>
        <div className="card p-6 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            The Threat Intel tab pulls CVE data directly from the{" "}
            <strong className="text-slate-300">NIST National Vulnerability Database (NVD)</strong> API in real time, filtered by the keywords you enable in <strong className="text-slate-300">Settings → CVE Keyword Filters</strong>.
            Results are cached for 30 minutes. Use the <strong className="text-slate-300">Refresh</strong> button to force an immediate re-fetch.
          </p>
          <div className="space-y-3.5">
            <Step n={1}>
              <strong className="text-slate-300">CVE Feed</strong> — CVEs are sorted by severity then CVSS score. Use the severity pills, date range, and keyword dropdown to narrow the list. The search bar filters by CVE ID or description text.
            </Step>
            <Step n={2}>
              <strong className="text-slate-300">Device Cross-Reference</strong> — The amber <em>"X devices"</em> badge means the CVE's affected software (from CPE data) fuzzy-matched against OS names in your NinjaOne inventory. Click the badge or expand the CVE to see the specific devices. Click a device name to jump to NinjaOne for details.
            </Step>
            <Step n={3}>
              <strong className="text-slate-300">Wazuh Coverage</strong> — The green shield badge indicates that a Wazuh rule references this CVE ID in its description. This means exploitation attempts may already be detected. A gray shield means no existing rule — consider adding a custom rule if the CVE poses a real risk.
            </Step>
            <Step n={4}>
              <strong className="text-slate-300">Remediation Guidance</strong> — Each CVE card shows an effort badge: <em>Patch Available</em>, <em>Workaround Only</em>, or <em>No Fix Available</em>, derived from the NVD reference tags. Expand a CVE for the full remediation summary and vendor advisory links.
            </Step>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm mt-2"
            style={{ background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.22)", color: "#a855f7" }}>
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Device matching is based on fuzzy keyword matching against CPE data — it errs on the side of inclusion. Verify manually before taking action on a match.</span>
          </div>
        </div>
      </section>

      {/* Suppression workflow */}
      <section>
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Rule Suppression Workflow</h2>
        <div className="card p-6 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            Use the <strong className="text-slate-300">Quick Suppress</strong> button on any noisy rule to generate ready-to-paste Wazuh XML and log the suppression decision in the changelog.
          </p>
          <div className="space-y-3.5">
            <Step n={1}>
              Open the <strong className="text-slate-300">Wazuh SIEM</strong> tab and navigate to <strong className="text-slate-300">Noisy Rules</strong>.
            </Step>
            <Step n={2}>
              Click a rule row to expand it and review the alert breakdown by agent, event ID, path, and user.
            </Step>
            <Step n={3}>
              Click <strong className="text-slate-300">Quick Suppress</strong> to open the suppression drawer. Review the impact preview — it shows alert count and estimated reduction %.
            </Step>
            <Step n={4}>
              Add an optional note explaining why this rule is being suppressed (e.g. "benign FIM noise from deployment script").
            </Step>
            <Step n={5}>
              Click <strong className="text-slate-300">Copy XML &amp; Log</strong>. The XML is copied to your clipboard and the entry is saved to the suppression changelog.
            </Step>
            <Step n={6}>
              Paste the XML into{" "}
              <code className="text-xs px-1.5 py-0.5 rounded text-slate-300" style={{ background: "rgba(45,43,85,0.8)" }}>
                local_rules.xml
              </code>{" "}
              on your Wazuh manager and restart the service.
            </Step>
          </div>
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm mt-2"
            style={{
              background: "rgba(251,191,36,0.07)",
              border: "1px solid rgba(251,191,36,0.22)",
              color: "#fbbf24",
            }}
          >
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              Suppressing rules reduces noise but also reduces visibility. Review the changelog periodically and reconsider suppressions after Wazuh rule updates.
            </span>
          </div>
        </div>
      </section>

      {/* Quick tips */}
      <section>
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Quick Tips</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              title: "Global search",
              body: "Press Ctrl+K from anywhere to search across rules, agents, and devices simultaneously. Results link directly into the relevant tab and context.",
            },
            {
              title: "CSV export",
              body: "Switch the Endpoint Intel view to Table mode to access the CSV export button. Downloads all correlated device data for offline analysis or reporting.",
            },
            {
              title: "Alert drilling",
              body: "Expand any row in the Wazuh alerts table to see Windows Event data, file hashes (SHA256/MD5/IMPHASH), MITRE ATT&CK tags, and VirusTotal links.",
            },
            {
              title: "Browser notifications",
              body: "Enable notifications in Settings to receive push alerts for new critical or high severity alerts even when the dashboard is in a background tab.",
            },
          ].map(({ title, body }) => (
            <div key={title} className="card p-4">
              <div className="text-sm font-semibold text-slate-200 mb-1.5">{title}</div>
              <div className="text-sm text-slate-500 leading-relaxed">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-xs text-slate-600 pt-2 pb-4">
        IT Operations Dashboard · Powered by Wazuh SIEM &amp; NinjaOne RMM
      </div>
    </div>
  );
}
