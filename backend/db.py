"""
SQLite persistence for the suppression change log and general changelog.
Database file lives at the project root (next to .env).
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "suppression_log.db"


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
