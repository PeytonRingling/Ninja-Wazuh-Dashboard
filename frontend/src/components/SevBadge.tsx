const STYLES: Record<string, string> = {
  critical: "badge-critical",
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
};

interface Props {
  severity: string;
  label?: string;
}

export default function SevBadge({ severity, label }: Props) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${STYLES[severity] ?? "bg-slate-600/30 text-slate-400 border-slate-500/30"}`}>
      {label ?? severity}
    </span>
  );
}
