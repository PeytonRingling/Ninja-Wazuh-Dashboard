"""
SQLite persistence for the suppression change log, changelog, and app settings.
Database file lives at the project root (next to .env).
"""
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

# DB_PATH env var lets Docker (or any deployment) put the DB wherever it needs to be.
# Falls back to the project root for local dev (existing behaviour).
DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "suppression_log.db")))

_DEFAULT_CVE_KEYWORDS = json.dumps([
    {"keyword": "Windows",      "enabled": True},
    {"keyword": "Chrome",       "enabled": True},
    {"keyword": "Firefox",      "enabled": True},
    {"keyword": "Cisco Meraki", "enabled": True},
    {"keyword": "Ubiquiti",     "enabled": True},
    {"keyword": "Bambu Lab",    "enabled": True},
    {"keyword": "Python",       "enabled": True},
    {"keyword": "FastAPI",      "enabled": True},
])

SETTINGS_DEFAULTS: dict[str, str] = {
    "notifications_enabled":  "false",
    "notify_critical":        "true",
    "notify_high":            "true",
    "notify_medium":          "false",
    "notify_low":             "false",
    "notification_cooldown":  "15",
    "agent_green_minutes":    "15",
    "agent_yellow_minutes":   "60",
    "offline_yellow_hours":   "1",
    "offline_orange_hours":   "24",
    "fleet_green_pct":        "80",
    "fleet_amber_pct":        "60",
    "patch_yellow_days":      "30",
    "patch_orange_days":      "90",
    "cve_keywords":           _DEFAULT_CVE_KEYWORDS,
    "default_theme":          "dark",
    "default_time_window":    "24h",
    "auto_refresh_interval":  "60",
    "noisy_rules_page_size":  "25",
    "alerts_page_size":       "25",
}


def init_db() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS suppression_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                rule_id       TEXT    NOT NULL,
                description   TEXT    NOT NULL,
                alert_count   INTEGER NOT NULL DEFAULT 0,
                reduction_pct REAL,
                notes         TEXT,
                total_alerts  INTEGER
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS changelog (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                rule_id       TEXT    NOT NULL,
                description   TEXT    NOT NULL,
                alert_count   INTEGER NOT NULL DEFAULT 0,
                reduction_pct REAL,
                notes         TEXT,
                total_alerts  INTEGER
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            )
        """)
        c.commit()


@contextmanager
def _conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def add_entry(rule_id: str, description: str, alert_count: int,
              reduction_pct: float | None, notes: str | None,
              total_alerts: int | None) -> dict:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO suppression_log
               (rule_id, description, alert_count, reduction_pct, notes, total_alerts)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (rule_id, description, alert_count, reduction_pct, notes or None, total_alerts),
        )
        c.commit()
        row = c.execute("SELECT * FROM suppression_log WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def get_all() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM suppression_log ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


# ── Changelog ─────────────────────────────────────────────────────────────────

def get_changelog() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM changelog ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def add_changelog_entry(rule_id: str, description: str, alert_count: int,
                        reduction_pct: float | None, notes: str | None,
                        total_alerts: int | None) -> dict:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO changelog
               (rule_id, description, alert_count, reduction_pct, notes, total_alerts)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (rule_id, description, alert_count, reduction_pct, notes or None, total_alerts),
        )
        c.commit()
        row = c.execute("SELECT * FROM changelog WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


# ── Settings ──────────────────────────────────────────────────────────────────

def get_settings_raw() -> dict[str, str]:
    """Return all settings as strings, filling gaps with defaults."""
    result = dict(SETTINGS_DEFAULTS)
    with _conn() as c:
        rows = c.execute("SELECT key, value FROM settings").fetchall()
        for row in rows:
            result[row["key"]] = row["value"]
    return result


def save_settings(updates: dict[str, str]) -> None:
    with _conn() as c:
        for key, value in updates.items():
            c.execute(
                """INSERT INTO settings (key, value, updated_at)
                   VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                   ON CONFLICT(key) DO UPDATE SET
                       value      = excluded.value,
                       updated_at = excluded.updated_at""",
                (key, value),
            )
        c.commit()
