import { useState, FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0d0d1a" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#a78bfa" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-100">OPS Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7"
          style={{ background: "#13132b", border: "1px solid #2d2b55" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={{
                  background: "#0d0d1a",
                  border: "1px solid #2d2b55",
                  color: "#f1f5f9",
                  caretColor: "#a78bfa",
                }}
                onFocus={e => (e.target.style.borderColor = "#7c3aed")}
                onBlur={e  => (e.target.style.borderColor = "#2d2b55")}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={{
                  background: "#0d0d1a",
                  border: "1px solid #2d2b55",
                  color: "#f1f5f9",
                  caretColor: "#a78bfa",
                }}
                onFocus={e => (e.target.style.borderColor = "#7c3aed")}
                onBlur={e  => (e.target.style.borderColor = "#2d2b55")}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-sm"
                style={{ background: "rgba(255,45,109,0.1)", border: "1px solid rgba(255,45,109,0.3)", color: "#ff6b9d" }}>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              style={{ background: loading ? "#6d28d9" : "#7c3aed" }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLElement).style.background = "#6d28d9"; }}
              onMouseLeave={e => { if (!loading) (e.target as HTMLElement).style.background = "#7c3aed"; }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
