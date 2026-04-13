import { useState, useEffect } from "react";

export default function FloatingHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") setOpen(s => !s);
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(s => !s)}
        className="fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg select-none"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #a855f7)",
          boxShadow: "0 0 20px rgba(124,58,237,0.4), 0 4px 12px rgba(0,0,0,0.4)",
          color: "#fff",
        }}
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[50000] flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="border rounded-2xl shadow-2xl p-6 w-80"
            style={{ background: "var(--card-bg-end, #13132b)", borderColor: "#2d2b55" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Keyboard Shortcuts</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              {([
                ["H", "Home"],
                ["W", "Wazuh SIEM"],
                ["N", "NinjaOne RMM"],
                ["E", "Endpoint Intel"],
                ["T", "Threat Intel"],
                ["G", "Guide"],
                ["S", "Settings"],
                ["R", "Refresh data"],
                ["D", "Dark / light toggle"],
                ["Ctrl+K", "Global search"],
                ["?", "Toggle this panel"],
                ["Escape", "Close drawers / search"],
              ] as [string, string][]).map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-surface-700 border border-surface-500 text-slate-300 font-mono text-[11px]">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
