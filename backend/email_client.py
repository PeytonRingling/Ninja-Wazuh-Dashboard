"""
SMTP email helper. All settings come from the DB so they can be changed
in the Settings tab without touching .env or restarting the container.
"""
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import db as db_module


def _get_smtp_settings() -> dict:
    raw = db_module.get_settings_raw()
    return {
        "host":       raw.get("smtp_host", ""),
        "port":       int(raw.get("smtp_port", "587")),
        "username":   raw.get("smtp_username", ""),
        "password":   raw.get("smtp_password", ""),
        "from_email": raw.get("smtp_from_email", ""),
        "from_name":  raw.get("smtp_from_name", "OPS Dashboard"),
        "tls":        raw.get("smtp_tls", "true") == "true",
        "enabled":    raw.get("smtp_enabled", "false") == "true",
    }


def send_email(to: str, subject: str, html: str, text: str = "") -> None:
    """Send an email. Raises on failure."""
    cfg = _get_smtp_settings()
    if not cfg["host"] or not cfg["from_email"]:
        raise ValueError("SMTP is not configured. Set host and from address in Settings.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"]      = to

    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context()
    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
        if cfg["tls"]:
            server.starttls(context=context)
        if cfg["username"] and cfg["password"]:
            server.login(cfg["username"], cfg["password"])
        server.sendmail(cfg["from_email"], to, msg.as_string())


def send_invite(to: str, username: str, temp_password: str, dashboard_url: str) -> None:
    subject = "You've been invited to OPS Dashboard"
    html = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:system-ui,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#13132b;border:1px solid #2d2b55;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#4c1d95,#2d1b69);padding:32px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">OPS Dashboard</h1>
      <p style="margin:8px 0 0;color:#c4b5fd;font-size:14px;">Your account is ready</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#e2e8f0;font-size:15px;margin:0 0 24px;">
        An account has been created for you on the OPS Dashboard.
        Here are your login details:
      </p>
      <div style="background:#0d0d1a;border:1px solid #2d2b55;border-radius:10px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#94a3b8;font-size:12px;padding:6px 0;width:110px;">URL</td>
            <td style="color:#a78bfa;font-size:13px;font-family:monospace;padding:6px 0;">
              <a href="{dashboard_url}" style="color:#a78bfa;">{dashboard_url}</a>
            </td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:12px;padding:6px 0;">Username</td>
            <td style="color:#f1f5f9;font-size:13px;font-family:monospace;padding:6px 0;">{username}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:12px;padding:6px 0;">Password</td>
            <td style="color:#f1f5f9;font-size:13px;font-family:monospace;padding:6px 0;">{temp_password}</td>
          </tr>
        </table>
      </div>
      <p style="color:#64748b;font-size:12px;margin:0;">
        Please change your password after your first login via Settings.
      </p>
    </div>
  </div>
</body>
</html>
"""
    text = (
        f"You've been invited to OPS Dashboard.\n\n"
        f"URL:      {dashboard_url}\n"
        f"Username: {username}\n"
        f"Password: {temp_password}\n\n"
        f"Please change your password after your first login."
    )
    send_email(to, subject, html, text)


def send_alert_notification(to: str, counts: dict) -> None:
    """
    Send an alert count digest email.
    counts = {"critical": N, "high": N, "medium": N, "low": N}
    """
    _SEV = [
        ("Critical", "critical", "#ff2d6d", "🔴"),
        ("High",     "high",     "#f97316", "🟠"),
        ("Medium",   "medium",   "#facc15", "🟡"),
        ("Low",      "low",      "#94a3b8", "🔵"),
    ]
    rows_html = ""
    rows_text = ""
    for label, key, color, emoji in _SEV:
        n = counts.get(key, 0)
        if n:
            rows_html += (
                f'<tr>'
                f'<td style="padding:8px 16px;color:{color};font-weight:700;">{emoji} {label}</td>'
                f'<td style="padding:8px 16px;color:#f1f5f9;font-size:20px;font-weight:700;">{n}</td>'
                f'</tr>'
            )
            rows_text += f"  {emoji} {label}: {n}\n"

    total = sum(counts.get(k, 0) for _, k, _, _ in _SEV)
    subject = f"⚠️ OPS Dashboard — {total} Alert{'s' if total != 1 else ''} Detected"

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:system-ui,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#13132b;border:1px solid #2d2b55;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#4c1d95,#2d1b69);padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">⚠️ Alert Notification</h1>
      <p style="margin:6px 0 0;color:#c4b5fd;font-size:13px;">OPS Dashboard detected new alerts</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">Current alert counts as of this check:</p>
      <table style="width:100%;border-collapse:collapse;background:#0d0d1a;border-radius:10px;overflow:hidden;border:1px solid #2d2b55;">
        {rows_html}
      </table>
      <p style="color:#64748b;font-size:11px;margin:20px 0 0;">
        To stop these emails, disable Alert Email Notifications in Settings → Email.
      </p>
    </div>
  </div>
</body>
</html>"""

    text = f"OPS Dashboard — New alerts detected:\n\n{rows_text}\nOpen your dashboard to review."
    send_email(to, subject, html, text)


def send_test_email(to: str) -> None:
    subject = "OPS Dashboard — SMTP test"
    html = """
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:system-ui,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#13132b;border:1px solid #2d2b55;border-radius:16px;padding:32px;">
    <h2 style="color:#a78bfa;margin:0 0 16px;">SMTP configured correctly</h2>
    <p style="color:#e2e8f0;font-size:14px;margin:0;">
      Your OPS Dashboard SMTP settings are working. You'll receive alerts and
      invite emails at this address.
    </p>
  </div>
</body>
</html>
"""
    send_email(to, subject, html, "Your OPS Dashboard SMTP settings are working correctly.")
