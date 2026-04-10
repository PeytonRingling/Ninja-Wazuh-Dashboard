import { useState } from "react";
import { PatchSummary, PatchDetail, NinjaDevice } from "../../api/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface Props {
  data: PatchSummary | null;
  error: string | null;
  devices: NinjaDevice[];
}

const STATUS_COLORS: Record<string, string> = {
  "Fully Patched": "#22c55e",
  "Pending": "#eab308",
  "Failed": "#ef4444",
};

function DevicePatchRow({
  deviceName, patches, badgeClass,
}: {
  deviceName: string;
  patches: PatchDetail[];
  badgeClass: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasCritical = patches.some((p) => p.severity === "CRITICAL");
  const hasImportant = patches.some((p) => p.severity === "IMPORTANT");
  const topSev = hasCritical ? "CRITICAL" : hasImportant ? "IMPORTANT" : patches[0]?.severity ?? "—";

  return (
    <>
      <tr
        onClick={() => setExpanded((e) => !e)}
        className={`border-b border-surface-700/50 cursor-pointer transition-colors hover:bg-surface-700/40 ${expanded ? "bg-surface-700/30" : ""}`}
      >
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform inline-block text-slate-500 ${expanded ? "rotate-90" : ""}`}>▶</span>
            <span className="text-sm font-medium text-slate-200">{deviceName}</span>
          </div>
        </td>
        <td className="py-2.5 px-3">
          <span className={`text-xs px-2 py-0.5 rounded border ${badgeClass}`}>
            {patches.length} {patches.length === 1 ? "patch" : "patches"}
          </span>
        </td>
        <td className="py-2.5 px-3 text-xs text-slate-400">{topSev}</td>
        <td className="py-2.5 px-3 text-xs text-slate-500">
          {patches.some((p) => p.type === "OS") && <span className="mr-1.5">OS</span>}
          {patches.some((p) => p.type === "Software") && <span>Software</span>}
        </td>
      </tr>
      {expanded && patches.map((p, i) => {
        const patchLabel = p.name && p.name !== "—" ? p.name : "—";
        return (
          <tr key={i} className="border-b border-surface-700/30 bg-surface-700/10">
            <td className="py-2 pl-10 pr-3 text-xs text-slate-300 max-w-sm">
              <span className="block truncate" title={patchLabel}>{patchLabel}</span>
              {p.identifier && (
                <span className="font-mono text-accent text-xs">{p.identifier}</span>
              )}
            </td>
            <td className="py-2 px-3 text-xs text-slate-500">{p.type ?? "—"}</td>
            <td className="py-2 px-3 text-xs text-slate-400">{p.severity ?? "—"}</td>
            <td className="py-2 px-3" />
          </tr>
        );
      })}
    </>
  );
}

function PatchSection({
  title, count, patches, deviceNameMap, badgeClass, colorClass,
}: {
  title: string;
  count: number;
  patches: PatchDetail[];
  deviceNameMap: Map<number, string>;
  colorClass: string;
  badgeClass: string;
}) {
  // Group patches by device
  const byDevice = new Map<string, { name: string; patches: PatchDetail[] }>();
  for (const p of patches) {
    const name = deviceNameMap.get(p.deviceId) ?? `Device ${p.deviceId}`;
    const key = String(p.deviceId);
    if (!byDevice.has(key)) byDevice.set(key, { name, patches: [] });
    byDevice.get(key)!.patches.push(p);
  }
  const deviceRows = [...byDevice.values()].sort((a, b) => b.patches.length - a.patches.length);

  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${colorClass}`}>
        {title} <span className="text-slate-500 font-normal normal-case tracking-normal">— {deviceRows.length} devices, {count} patches</span>
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-600">
              <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Device</th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Patches</th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Top Severity</th>
              <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Types</th>
            </tr>
          </thead>
          <tbody>
            {deviceRows.map((row) => (
              <DevicePatchRow
                key={row.name}
                deviceName={row.name}
                patches={row.patches}
                badgeClass={badgeClass}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type PatchFilter = "all" | "failed" | "pending";

export default function PatchCompliance({ data, error, devices }: Props) {
  const [filter, setFilter] = useState<PatchFilter>("all");

  const deviceNameMap = new Map<number, string>(
    devices.map((d) => [d.id, d.displayName ?? d.systemName ?? `Device ${d.id}`])
  );
  const chartData = data
    ? [
        { name: "Fully Patched", value: data.fully_patched },
        { name: "Pending", value: data.patches_pending },
        { name: "Failed", value: data.patches_failed },
      ]
    : [];

  const failed = data
    ? data.patch_details.filter((p) => p.status === "FAILED")
    : [];
  const pending = data
    ? data.patch_details.filter((p) => p.status === "NEEDS_UPDATE")
    : [];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Patch Compliance</h3>

      {error ? (
        <div className="text-red-400 text-sm text-center py-4">{error}</div>
      ) : !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
          <div className="skeleton h-40 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total Devices", value: data.total_devices, color: "text-slate-200" },
              { label: "Fully Patched", value: data.fully_patched, color: "text-green-400" },
              { label: "Pending", value: data.patches_pending, color: "text-yellow-400" },
              { label: "Failed", value: data.patches_failed, color: "text-red-400" },
            ].map((card) => (
              <div key={card.label} className="bg-surface-700 border border-surface-600 rounded-xl p-3">
                <div className={`text-2xl font-bold tabular-nums ${card.color}`}>
                  {card.value.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">{card.label}</div>
                {card.label !== "Total Devices" && data.total_devices > 0 && (
                  <div className="mt-2 h-1 bg-surface-600 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((card.value / data.total_devices) * 100)}%`,
                        background: card.color.includes("green") ? "#22c55e" : card.color.includes("yellow") ? "#eab308" : "#ef4444",
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="mb-6">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip
                  contentStyle={{ background: "#0f1629", border: "1px solid #1a2540", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Patch detail sections */}
          {(failed.length > 0 || pending.length > 0) && (
            <div>
              {/* Filter buttons */}
              <div className="flex gap-1.5 mb-4 border-t border-surface-600 pt-4">
                {([
                  { key: "all",     label: "All",     count: failed.length + pending.length, cls: "bg-accent/20 text-accent border-accent/30" },
                  { key: "failed",  label: "Failed",  count: failed.length,                  cls: "bg-red-500/20 text-red-400 border-red-500/30" },
                  { key: "pending", label: "Pending", count: pending.length,                 cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
                ] as { key: PatchFilter; label: string; count: number; cls: string }[]).map(({ key, label, count, cls }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      filter === key ? cls : "text-slate-400 border-surface-600 hover:text-slate-200 hover:border-surface-500"
                    }`}
                  >
                    {label}
                    <span className="tabular-nums opacity-70">({count})</span>
                  </button>
                ))}
              </div>

              <div className="space-y-6">
                {(filter === "all" || filter === "failed") && failed.length > 0 && (
                  <PatchSection
                    title="Failed Patches"
                    count={failed.length}
                    patches={failed}
                    deviceNameMap={deviceNameMap}
                    colorClass="text-red-400"
                    badgeClass="bg-red-500/10 border-red-500/30 text-red-400"
                  />
                )}
                {(filter === "all" || filter === "pending") && pending.length > 0 && (
                  <PatchSection
                    title="Pending Patches"
                    count={pending.length}
                    patches={pending}
                    deviceNameMap={deviceNameMap}
                    colorClass="text-yellow-400"
                    badgeClass="bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
