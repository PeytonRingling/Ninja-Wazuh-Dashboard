import { useState, useEffect } from "react";
import { api } from "../api/client";

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  background: "#1a1a3e",
  border: "1px solid #2d2b55",
  borderRadius: 10,
  fontSize: 14,
  color: "#f1f5f9",
  caretColor: "#a78bfa",
  outline: "none",
};

const label: React.CSSProperties = {
  display: "block",
  color: "#9896c8",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

export default function InviteSetupPage({ token }: { token: string }) {
  const [info, setInfo]           = useState<{ email: string; role: string } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [checking, setChecking]   = useState(true);

  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.validateSetupToken(token)
      .then(setInfo)
      .catch(() => setTokenError("This invite link is invalid or has already been used."))
      .finally(() => setChecking(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!username.trim())        { setFormError("Username is required"); return; }
    if (password.length < 8)     { setFormError("Password must be at least 8 characters"); return; }
    if (password !== confirm)    { setFormError("Passwords do not match"); return; }
    setSubmitting(true);
    try {
      const result = await api.completeSetup(token, username.trim(), password);
      localStorage.setItem("auth_token", result.token);
      window.location.replace("/");
    } catch (err) {
      setFormError(err instanceof Error ? err.message.replace(/^\d+: /, "") : "Failed to create account");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "#0d0d1a",
        backgroundImage: "radial-gradient(rgba(124,58,237,0.07) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 52, height: 52, borderRadius: 14, marginBottom: 12,
            background: "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(168,85,247,0.12))",
            border: "1px solid rgba(124,58,237,0.40)",
            boxShadow: "0 0 24px rgba(124,58,237,0.28)",
          }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#a78bfa" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div style={{
            background: "linear-gradient(135deg, #a855f7, #7c3aed)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontSize: 18, fontWeight: 800, letterSpacing: "0.08em",
          }}>
            OPS DASHBOARD
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "#13132b",
          border: "1px solid #2d2b55",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}>
          {/* Validating */}
          {checking && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 28, height: 28, margin: "0 auto 14px",
                borderRadius: "50%",
                border: "2px solid rgba(124,58,237,0.3)",
                borderTopColor: "#7c3aed",
                animation: "spin 0.8s linear infinite",
              }} />
              <p style={{ color: "#6e6c9e", fontSize: 14, margin: 0 }}>Validating invite…</p>
            </div>
          )}

          {/* Invalid token */}
          {!checking && tokenError && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <p style={{ color: "#ff2d6d", fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
                Invite Invalid
              </p>
              <p style={{ color: "#6e6c9e", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                {tokenError}
              </p>
            </div>
          )}

          {/* Setup form */}
          {!checking && info && (
            <>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ color: "#e2e8ff", fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
                  Set up your account
                </h2>
                <p style={{ color: "#6e6c9e", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                  Invited as&nbsp;
                  <span style={{ color: "#a78bfa", fontWeight: 600 }}>{info.role}</span>
                  &nbsp;·&nbsp;
                  <span style={{ color: "#9896c8" }}>{info.email}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={label}>Username</label>
                  <input
                    type="text" value={username} onChange={e => setUsername(e.target.value)}
                    required autoFocus autoComplete="username"
                    placeholder="Choose a username"
                    style={field}
                  />
                </div>
                <div>
                  <label style={label}>Password</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    required autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    style={field}
                  />
                </div>
                <div>
                  <label style={label}>Confirm Password</label>
                  <input
                    type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    required autoComplete="new-password"
                    placeholder="Repeat your password"
                    style={field}
                  />
                </div>

                {formError && (
                  <p style={{
                    color: "#ff2d6d", fontSize: 13, margin: 0,
                    padding: "8px 12px",
                    background: "rgba(255,45,109,0.08)",
                    border: "1px solid rgba(255,45,109,0.25)",
                    borderRadius: 8, lineHeight: 1.5,
                  }}>
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    marginTop: 4,
                    padding: "12px 0",
                    background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                    border: "none", borderRadius: 10,
                    color: "#fff", fontSize: 15, fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                    boxShadow: "0 0 24px rgba(124,58,237,0.35)",
                    transition: "opacity 0.15s",
                  }}
                >
                  {submitting ? "Creating Account…" : "Create Account"}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", color: "#3d3b6a", fontSize: 12, marginTop: 20 }}>
          Already have an account?{" "}
          <a href="/" style={{ color: "#7c3aed", textDecoration: "none" }}>Sign in</a>
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
