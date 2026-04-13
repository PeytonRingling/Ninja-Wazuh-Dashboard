import { useState, useCallback } from "react";
import { WazuhAgent, api } from "../../api/client";
import { format, parseISO } from "date-fns";
import ContextMenu, { ContextMenuItem } from "../ContextMenu";

interface Props {
  data: WazuhAgent[] | null;
  error: string | null;
  onFilterAlerts?: (agentName: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-500/10 border-green-500/30 text-green-400",
  disconnected: "bg-red-500/10 border-red-500/30 text-red-400",
  never_connected: "bg-slate-500/10 border-slate-500/30 text-slate-400",
  pending: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400 shadow-[0_0_6px_#4ade80]",
  disconnected: "bg-red-400",
  never_connected: "bg-slate-500",
  pending: "bg-yellow-400",
};

function lastActiveColor(lastKeepAlive: string | undefined): string {
  if (!lastKeepAlive) return "opacity-50";
  try {
    const diffMin = (Date.now() - parseISO(lastKeepAlive).getTime()) / 60000;
    if (diffMin < 15) return "text-green-400 opacity-80";
    if (diffMin < 60) return "text-yellow-400 opacity-80";
    return "text-red-400 opacity-80";
  } catch {
    return "opacity-50";
  }
}

function AgentCard({
  agent,
  onContextMenu,
}: {
  agent: WazuhAgent;
  onContextMenu: (e: React.MouseEvent, agent: WazuhAgent) => void;
}) {
  const status = agent.status ?? "unknown";
  const cardStyle = STATUS_STYLES[status] ?? "bg-surface-700 border-surface-500 text-slate-400";
  const dotStyle = STATUS_DOT[status] ?? "bg-slate-500";

  const osName = agent.os?.name ?? agent.os?.platform ?? "Unknown OS";
  const lastSeen = agent.lastKeepAlive
    ? (() => { try { return format(parseISO(agent.lastKeepAlive), "MMM d, HH:mm"); } catch { return agent.lastKeepAlive; } })()
    : "—";

  return (
    <div
      className={`rounded-xl border p-3 ${cardStyle} transition-all hover:shadow-lg cursor-context-menu select-none`}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, agent); }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotStyle}`} />
          <span className="font-medium text-sm truncate">{agent.name}</span>
        </div>
        <span className="text-xs capitalize px-1.5 py-0.5 rounded bg-black/20 shrink-0">
          {status.replace("_", " ")}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs opacity-70">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
          <span className="truncate">{osName}</span>
        </div>
        {agent.ip && (
          <div className="flex items-center gap-1.5 text-xs opacity-70 font-mono">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
            {agent.ip}
          </div>
        )}
        <div className={`text-xs ${lastActiveColor(agent.lastKeepAlive)}`} title="Last keep-alive from agent">Last: {lastSeen}</div>
      </div>
    </div>
  );
}

export default function AgentStatus({ data, error, onFilterAlerts }: Props) {
  const [ctx, setCtx] = useState<{ x: number; y: number; agent: WazuhAgent } | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [restartMsg, setRestartMsg] = useState<{ id: string; ok: boolean } | null>(null);

  const sorted = data
    ? [...data].sort((a, b) => {
        const order: Record<string, number> = { active: 0, pending: 1, disconnected: 2, never_connected: 3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      })
    : null;

  const counts = sorted
    ? {
        active: sorted.filter((a) => a.status === "active").length,
        disconnected: sorted.filter((a) => a.status === "disconnected").length,
        other: sorted.filter((a) => a.status !== "active" && a.status !== "disconnected").length,
      }
    : null;

  const handleContextMenu = useCallback((e: React.MouseEvent, agent: WazuhAgent) => {
    setCtx({ x: e.clientX, y: e.clientY, agent });
  }, []);

  const handleRestart = async (agent: WazuhAgent) => {
    setRestarting(agent.id);
    try {
      await api.wazuhRestartAgent(agent.id);
      setRestartMsg({ id: agent.id, ok: true });
    } catch {
      setRestartMsg({ id: agent.id, ok: false });
    } finally {
      setRestarting(null);
      setTimeout(() => setRestartMsg(null), 3000);
    }
  };

  const ctxItems: ContextMenuItem[] = ctx
    ? [
        {
          label: restarting === ctx.agent.id ? "Restarting…" : "Restart Agent",
          icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
          disabled: restarting === ctx.agent.id || ctx.agent.status !== "active",
          onClick: () => handleRestart(ctx.agent),
        },
        {
          label: "View Alerts",
          icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
          onClick: () => onFilterAlerts?.(ctx.agent.name),
        },
      ]
    : [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Agent Status</h3>
          {counts && (
            <div className="flex gap-3 mt-1">
              <span className="text-xs text-green-400">{counts.active} active</span>
              {counts.disconnected > 0 && (
                <span className="text-xs text-red-400">{counts.disconnected} disconnected</span>
              )}
              {counts.other > 0 && (
                <span className="text-xs text-slate-500">{counts.other} other</span>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] text-slate-600">Right-click an agent for actions</span>
      </div>

      {restartMsg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${restartMsg.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {restartMsg.ok ? "Agent restart command sent successfully." : "Failed to send restart command."}
        </div>
      )}

      {error ? (
        <div className="text-red-400 text-sm text-center py-4">{error}</div>
      ) : !sorted ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">No agents found</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {sorted.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onContextMenu={handleContextMenu} />
          ))}
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
