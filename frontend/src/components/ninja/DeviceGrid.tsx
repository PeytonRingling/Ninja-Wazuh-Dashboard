import { useState, useMemo, useCallback } from "react";
import { NinjaDevice } from "../../api/client";
import { format } from "date-fns";
import ContextMenu, { ContextMenuItem } from "../ContextMenu";

interface Props {
  data: NinjaDevice[] | null;
  error: string | null;
  initialSearch?: string;
  ninjaWebUrl?: string;
  onNavigateToWazuh?: (deviceName: string) => void;
}

function isOnline(device: NinjaDevice): boolean {
  if (device.offline !== undefined) return !device.offline;
  const ts = device.lastContact ?? device.lastSeenAt;
  if (ts) {
    const tsSec = ts > 1e12 ? ts / 1000 : ts;
    return Date.now() / 1000 - tsSec < 600;
  }
  return false;
}

function offlineDuration(device: NinjaDevice): { label: string; color: string } | null {
  if (isOnline(device)) return null;
  const ts = device.lastContact ?? device.lastSeenAt;
  if (!ts) return null;
  const tsSec = ts > 1e12 ? ts / 1000 : ts;
  const diffSec = Math.floor(Date.now() / 1000 - tsSec);
  if (diffSec < 0) return null;
  const diffHrs = diffSec / 3600;
  const color = diffHrs < 1 ? "text-yellow-400" : diffHrs < 24 ? "text-orange-400" : "text-red-400";
  let label: string;
  if (diffSec < 3600) label = `${Math.floor(diffSec / 60)}m`;
  else if (diffSec < 86400) label = `${Math.floor(diffHrs)}h ${Math.floor((diffSec % 3600) / 60)}m`;
  else {
    const d = Math.floor(diffSec / 86400);
    const h = Math.floor((diffSec % 86400) / 3600);
    label = h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  return { label, color };
}

function fmtLastSeen(device: NinjaDevice): string {
  const ts = device.lastContact ?? device.lastSeenAt;
  if (!ts) return "—";
  try {
    return format(new Date(ts > 1e12 ? ts : ts * 1000), "MMM d, HH:mm");
  } catch {
    return "—";
  }
}

function fmtRam(device: NinjaDevice): string {
  const bytes = device.system?.totalPhysicalMemory ?? device.memory?.capacity;
  if (!bytes) return "—";
  return `${Math.round(bytes / 1024 / 1024 / 1024)} GB`;
}

function fmtNodeClass(cls?: string): string {
  if (!cls) return "—";
  return cls.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type SortKey = "name" | "status" | "os" | "lastSeen" | "ip" | "type";
type StatusFilter = "all" | "online" | "offline";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`ml-1 text-xs ${active ? "text-accent" : "text-slate-600"}`}>
      {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );
}

function DeviceRow({
  device,
  onContextMenu,
}: {
  device: NinjaDevice;
  onContextMenu: (e: React.MouseEvent, device: NinjaDevice) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const online = isOnline(device);
  const name = device.displayName ?? device.systemName ?? `Device ${device.id}`;
  const ip = device.ipAddresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a) && !a.startsWith("169.")) ?? "—";

  return (
    <>
      <tr
        onClick={() => setExpanded((e) => !e)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, device); }}
        className={`border-b border-surface-700/50 cursor-pointer transition-colors hover:bg-surface-700/40 ${
          expanded ? "bg-surface-700/30" : ""
        }`}
      >
        {/* Status */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                online ? "bg-green-400 shadow-[0_0_6px_#4ade80]" : "bg-slate-500"
              }`}
            />
            <div className="flex flex-col leading-none">
              <span className={`text-xs font-medium ${online ? "text-green-400" : "text-slate-500"}`}>
                {online ? "Online" : "Offline"}
              </span>
              {!online && (() => { const od = offlineDuration(device); return od ? <span className={`text-[10px] mt-0.5 tabular-nums ${od.color}`}>{od.label}</span> : null; })()}
            </div>
          </div>
        </td>

        {/* Name */}
        <td className="py-2.5 px-3">
          <span className="text-sm font-medium text-slate-200">{name}</span>
        </td>

        {/* IP */}
        <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{ip}</td>

        {/* OS */}
        <td className="py-2.5 px-3 text-xs text-slate-400 max-w-[180px]">
          <span className="truncate block" title={device.os?.name}>{device.os?.name ?? "—"}</span>
        </td>

        {/* Type */}
        <td className="py-2.5 px-3 text-xs text-slate-500">{fmtNodeClass(device.nodeClass)}</td>

        {/* Last User */}
        <td className="py-2.5 px-3 text-xs text-slate-400 max-w-[120px]">
          <span className="truncate block" title={device.lastLoggedOnUser}>{device.lastLoggedOnUser ?? "—"}</span>
        </td>

        {/* RAM */}
        <td className="py-2.5 px-3 text-xs text-slate-400 text-right">{fmtRam(device)}</td>

        {/* Last seen */}
        <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap text-right">
          {fmtLastSeen(device)}
        </td>

        {/* Expand toggle */}
        <td className="py-2.5 px-3 text-center">
          <span className={`text-slate-600 text-xs transition-transform inline-block ${expanded ? "rotate-180" : ""}`}>▾</span>
        </td>
      </tr>

      {/* Expanded details row */}
      {expanded && (
        <tr className="border-b border-surface-700/50 bg-surface-700/20">
          <td colSpan={9} className="px-6 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-8 gap-y-2 text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-500">Device ID</span>
                <span className="text-slate-300 font-mono">{device.id}</span>
              </div>
              {device.ipAddresses && device.ipAddresses.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">All IPs</span>
                  <span className="text-slate-300 font-mono text-xs leading-relaxed">
                    {device.ipAddresses.filter((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)).slice(0, 3).join(", ")}
                  </span>
                </div>
              )}
              {device.system?.name && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">Hostname</span>
                  <span className="text-slate-300">{device.system.name}</span>
                </div>
              )}
              {device.os?.name && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">OS</span>
                  <span className="text-slate-300">{device.os.name}</span>
                </div>
              )}
              {device.system?.manufacturer && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">Manufacturer</span>
                  <span className="text-slate-300">{device.system.manufacturer}</span>
                </div>
              )}
              {device.system?.model && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">Model</span>
                  <span className="text-slate-300">{device.system.model}</span>
                </div>
              )}
              {fmtRam(device) !== "—" && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">RAM</span>
                  <span className="text-slate-300">{fmtRam(device)}</span>
                </div>
              )}
              {device.processors && device.processors.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-500">CPU</span>
                  <span className="text-slate-300 truncate">{device.processors[0].name}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function exportCSV(devices: NinjaDevice[]) {
  const headers = ["Name", "Status", "IP", "OS", "Type", "Last User", "RAM", "Last Seen"];
  const rows = devices.map((d) => [
    d.displayName ?? d.systemName ?? `Device ${d.id}`,
    isOnline(d) ? "Online" : "Offline",
    d.ipAddresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a) && !a.startsWith("169.")) ?? "",
    d.os?.name ?? "",
    fmtNodeClass(d.nodeClass),
    d.lastLoggedOnUser ?? "",
    fmtRam(d),
    fmtLastSeen(d),
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "devices.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function DeviceGrid({ data, error, initialSearch, ninjaWebUrl, onNavigateToWazuh }: Props) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [ctx, setCtx] = useState<{ x: number; y: number; device: NinjaDevice } | null>(null);

  const onlineCount = data ? data.filter(isOnline).length : 0;
  const offlineCount = data ? data.length - onlineCount : 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const processed = useMemo(() => {
    if (!data) return null;

    const q = search.trim().toLowerCase();
    let list = data.filter((d) => {
      if (statusFilter === "online" && !isOnline(d)) return false;
      if (statusFilter === "offline" && isOnline(d)) return false;
      if (q) {
        const name = (d.displayName ?? d.systemName ?? "").toLowerCase();
        const ip = (d.ipAddresses ?? []).join(" ").toLowerCase();
        const os = (d.os?.name ?? "").toLowerCase();
        const type = (d.nodeClass ?? "").toLowerCase();
        if (!name.includes(q) && !ip.includes(q) && !os.includes(q) && !type.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "name":    av = (a.displayName ?? a.systemName ?? "").toLowerCase(); bv = (b.displayName ?? b.systemName ?? "").toLowerCase(); break;
        case "status":  av = isOnline(a) ? 0 : 1; bv = isOnline(b) ? 0 : 1; break;
        case "os":      av = (a.os?.name ?? "").toLowerCase(); bv = (b.os?.name ?? "").toLowerCase(); break;
        case "lastSeen": av = a.lastContact ?? a.lastSeenAt ?? 0; bv = b.lastContact ?? b.lastSeenAt ?? 0; break;
        case "ip":      av = (a.ipAddresses?.[0] ?? ""); bv = (b.ipAddresses?.[0] ?? ""); break;
        case "type":    av = (a.nodeClass ?? "").toLowerCase(); bv = (b.nodeClass ?? "").toLowerCase(); break;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [data, search, statusFilter, sortKey, sortDir]);

  const handleContextMenu = useCallback((e: React.MouseEvent, device: NinjaDevice) => {
    setCtx({ x: e.clientX, y: e.clientY, device });
  }, []);

  const ctxItems: ContextMenuItem[] = ctx
    ? [
        ...(ninjaWebUrl
          ? [{
              label: "Open in NinjaOne",
              icon: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14",
              onClick: () => {
                const name = ctx.device.displayName ?? ctx.device.systemName ?? "";
                window.open(`${ninjaWebUrl.replace(/\/$/, "")}/devices?search=${encodeURIComponent(name)}`, "_blank");
              },
            }]
          : []),
        {
          label: "View Wazuh Alerts",
          icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
          onClick: () => {
            const name = ctx.device.displayName ?? ctx.device.systemName ?? "";
            onNavigateToWazuh?.(name);
          },
        },
      ]
    : [];

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => handleSort(k)}
      className="text-left py-2.5 px-3 text-xs font-medium text-slate-400 whitespace-nowrap cursor-pointer hover:text-slate-200 select-none"
    >
      {label}
      <SortIcon active={sortKey === k} dir={sortDir} />
    </th>
  );

  return (
    <div className="card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">All Devices</h3>
          {data && (
            <div className="flex gap-3 mt-1">
              <span className="text-xs text-green-400">{onlineCount} online</span>
              <span className="text-xs text-slate-500">{offlineCount} offline</span>
              {processed && processed.length !== data.length && (
                <span className="text-xs text-accent">{processed.length} shown</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search name, IP, OS, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-surface-700 border border-surface-600 rounded-lg text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-accent w-56"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                ×
              </button>
            )}
          </div>

          {/* Status filter */}
          {(["all", "online", "offline"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === f
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              {f}
            </button>
          ))}

          {/* CSV Export */}
          {processed && processed.length > 0 && (
            <button
              onClick={() => exportCSV(processed)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white border border-surface-600 hover:border-surface-500 bg-surface-700 hover:bg-surface-600 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="text-red-400 text-sm text-center py-6">{error}</div>
      ) : !processed ? (
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
      ) : processed.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-10">
          {search ? `No devices match "${search}"` : "No devices match filter"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-600">
                <Th label="Status" k="status" />
                <Th label="Name" k="name" />
                <Th label="IP" k="ip" />
                <Th label="OS" k="os" />
                <Th label="Type" k="type" />
                <th className="text-left py-2.5 px-3 text-xs font-medium text-slate-400">Last User</th>
                <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-400">RAM</th>
                <Th label="Last Seen" k="lastSeen" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {processed.map((device) => (
                <DeviceRow key={device.id} device={device} onContextMenu={handleContextMenu} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={ctxItems}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}
