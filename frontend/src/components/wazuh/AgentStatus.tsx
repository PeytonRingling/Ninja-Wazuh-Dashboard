import { WazuhAgent } from "../../api/client";
import { format, parseISO } from "date-fns";

interface Props {
  data: WazuhAgent[] | null;
  error: string | null;
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

function AgentCard({ agent }: { agent: WazuhAgent }) {
  const status = agent.status ?? "unknown";
  const cardStyle = STATUS_STYLES[status] ?? "bg-surface-700 border-surface-500 text-slate-400";
  const dotStyle = STATUS_DOT[status] ?? "bg-slate-500";

  const osName = agent.os?.name ?? agent.os?.platform ?? "Unknown OS";
  const lastSeen = agent.lastKeepAlive
    ? (() => { try { return format(parseISO(agent.lastKeepAlive), "MMM d, HH:mm"); } catch { return agent.lastKeepAlive; } })()
    : "—";

  return (
    <div className={`rounded-xl border p-3 ${cardStyle} transition-all hover:shadow-lg`}>
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
        <div className="text-xs opacity-50">Last: {lastSeen}</div>
      </div>
    </div>
  );
}

export default function AgentStatus({ data, error }: Props) {
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
      </div>

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
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
