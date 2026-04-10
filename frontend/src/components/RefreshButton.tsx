interface Props {
  onClick: () => void;
  loading: boolean;
}

export default function RefreshButton({ onClick, loading }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
    >
      <svg
        className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  );
}
