import asyncio
import csv
import io
import json
import logging
import os
import re
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx

# Ensure backend/ is always first on sys.path so imports work regardless of CWD
_backend_dir = str(Path(__file__).parent.resolve())
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load .env from project root (one level up from backend/)
load_dotenv(Path(__file__).parent.parent / ".env")

from auth import WazuhAuth, NinjaAuth
from wazuh_client import WazuhClient
from ninja_client import NinjaClient
from indexer_client import IndexerClient
import cache
import db as db_module
import user_auth
import email_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Globals populated at startup
wazuh: WazuhClient = None
ninja: NinjaClient = None

# ── Alert email watcher ────────────────────────────────────────────────────────

_prev_alert_counts: dict | None = None
_last_alert_email_ts: float = 0.0


async def _alert_email_watcher() -> None:
    """Background task: email when Wazuh alert counts increase."""
    global _prev_alert_counts, _last_alert_email_ts
    await asyncio.sleep(90)          # initial delay so startup can settle
    while True:
        try:
            raw = db_module.get_settings_raw()
            if raw.get("email_alerts_enabled") != "true" or raw.get("smtp_enabled") != "true":
                await asyncio.sleep(60)
                continue

            alert_to = raw.get("email_alert_to", "").strip()
            if not alert_to:
                await asyncio.sleep(60)
                continue

            summary = await wazuh.get_summary()
            current = {
                "critical": summary.get("critical", 0),
                "high":     summary.get("high",     0),
                "medium":   summary.get("medium",   0),
                "low":      summary.get("low",      0),
            }

            if _prev_alert_counts is None:
                _prev_alert_counts = current
                await asyncio.sleep(60)
                continue

            # Determine which severities increased and are watched
            triggered = any(
                raw.get(f"email_notify_{sev}") == "true"
                and current[sev] > _prev_alert_counts.get(sev, 0)
                for sev in ("critical", "high", "medium", "low")
            )

            _prev_alert_counts = current

            if triggered:
                cooldown = int(raw.get("email_cooldown_minutes", "15")) * 60
                if time.time() - _last_alert_email_ts >= cooldown:
                    email_client.send_alert_notification(alert_to, current)
                    _last_alert_email_ts = time.time()
                    logger.info(f"Alert notification email sent to {alert_to}")

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Alert email watcher error: {e}")

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global wazuh, ninja

    wazuh_url = os.getenv("WAZUH_URL", "")
    wazuh_user = os.getenv("WAZUH_USERNAME", "")
    wazuh_pass = os.getenv("WAZUH_PASSWORD", "")
    indexer_url = os.getenv("WAZUH_INDEXER_URL", "")
    indexer_user = os.getenv("WAZUH_INDEXER_USERNAME", "")
    indexer_pass = os.getenv("WAZUH_INDEXER_PASSWORD", "")
    ninja_url = os.getenv("NINJA_URL", "")
    ninja_id = os.getenv("NINJA_CLIENT_ID", "")
    ninja_secret = os.getenv("NINJA_CLIENT_SECRET", "")

    if not all([wazuh_url, wazuh_user, wazuh_pass,
                indexer_url, indexer_user, indexer_pass,
                ninja_url, ninja_id, ninja_secret]):
        logger.error("Missing required environment variables. Check .env file.")
        sys.exit(1)

    wazuh_auth = WazuhAuth(wazuh_url, wazuh_user, wazuh_pass)
    indexer = IndexerClient(indexer_url, indexer_user, indexer_pass)
    ninja_auth = NinjaAuth(ninja_url, ninja_id, ninja_secret)

    wazuh = WazuhClient(wazuh_auth, indexer)
    ninja = NinjaClient(ninja_auth)

    # Initialize DB (creates tables including users)
    db_module.init_db()

    # Create default admin on first run
    if db_module.user_count() == 0:
        import secrets as _secrets
        default_password = _secrets.token_urlsafe(12)
        db_module.create_user("admin", user_auth.hash_password(default_password), "admin")
        logger.info("=" * 60)
        logger.info("  DEFAULT ADMIN CREATED")
        logger.info(f"  Username : admin")
        logger.info(f"  Password : {default_password}")
        logger.info("  Change this password after first login!")
        logger.info("=" * 60)

    # Pre-authenticate both
    try:
        await wazuh_auth.get_token()
        logger.info("Wazuh authenticated successfully")
    except Exception as e:
        logger.warning(f"Wazuh initial auth failed: {e}")

    try:
        await ninja_auth.get_token()
        logger.info("NinjaOne authenticated successfully")
    except Exception as e:
        logger.warning(f"NinjaOne initial auth failed: {e}")

    # Start background alert email watcher
    task = asyncio.create_task(_alert_email_watcher())

    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="IT Operations Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth middleware — protects all /api/* except /api/auth/login ───────────────
_PUBLIC_PATHS = {"/api/auth/login", "/api/auth/setup"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/") or path in _PUBLIC_PATHS:
        return await call_next(request)
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    username = user_auth.decode_token(auth_header[7:])
    if not username:
        return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)
    if not db_module.get_user(username):
        return JSONResponse({"detail": "User not found"}, status_code=401)
    return await call_next(request)

app.include_router(user_auth.router)


# ── Summary ────────────────────────────────────────────────────────────────────

@app.get("/api/summary")
async def get_summary():
    result = {"wazuh": None, "wazuh_error": None, "ninja": None, "ninja_error": None}
    try:
        result["wazuh"] = await wazuh.get_summary()
    except Exception as e:
        result["wazuh_error"] = str(e)
    try:
        result["ninja"] = await ninja.get_summary()
    except Exception as e:
        result["ninja_error"] = str(e)
    return result


# ── Wazuh ──────────────────────────────────────────────────────────────────────

@app.get("/api/wazuh/alerts")
async def get_wazuh_alerts(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    severity: str = Query(None),
    agent: str = Query(None),
    rule_id: str = Query(None),
    hours_back: int = Query(24, ge=1, le=168),
):
    try:
        return await wazuh.get_alerts(limit, offset, severity, agent, rule_id, hours_back)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/noisy-rules")
async def get_noisy_rules(hours_back: int = Query(24, ge=1, le=168)):
    try:
        return await wazuh.get_noisy_rules(hours_back)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/agents")
async def get_wazuh_agents():
    try:
        return await wazuh.get_agents()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/alert-volume")
async def get_alert_volume(timeframe: str = Query("24h", pattern="^(24h|7d|30d)$")):
    try:
        return await wazuh.get_alert_volume(timeframe)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/rule-breakdown")
async def get_rule_breakdown(
    rule_id: str = Query(...),
    hours_back: int = Query(24, ge=1, le=168),
):
    try:
        return await wazuh.get_rule_breakdown(rule_id, hours_back)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/rule-trend")
async def get_rule_trend(rule_id: str = Query(...)):
    try:
        return await wazuh.get_rule_trend(rule_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/rule-detail")
async def get_rule_detail_endpoint(rule_id: str = Query(...)):
    try:
        return await wazuh.get_rule_detail(rule_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/rule-dimension-detail")
async def get_rule_dimension_detail(
    rule_id:    str = Query(...),
    field:      str = Query(...),
    value:      str = Query(...),
    hours_back: int = Query(24, ge=1, le=168),
):
    try:
        return await wazuh.get_rule_dimension_detail(rule_id, field, value, hours_back)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/wazuh/agent-alert-summary")
async def get_agent_alert_summary(hours_back: int = Query(24, ge=1, le=168)):
    try:
        return await wazuh.get_agent_alert_summary(hours_back)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/wazuh/refresh")
async def refresh_wazuh():
    for key in list(cache._cache.keys()):
        if key.startswith("wazuh"):
            cache.invalidate(key)
    return {"status": "ok"}


@app.post("/api/wazuh/agents/{agent_id}/restart")
async def restart_wazuh_agent(agent_id: str):
    try:
        return await wazuh.restart_agent(agent_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Suppression Change Log ─────────────────────────────────────────────────────

class SuppressionLogIn(BaseModel):
    rule_id: str
    description: str
    alert_count: int
    reduction_pct: Optional[float] = None
    notes: Optional[str] = None
    total_alerts: Optional[int] = None


@app.get("/api/wazuh/suppression-log")
async def list_suppression_log():
    return db_module.get_all()


@app.post("/api/wazuh/suppression-log")
async def create_suppression_log(entry: SuppressionLogIn):
    return db_module.add_entry(
        entry.rule_id, entry.description, entry.alert_count,
        entry.reduction_pct, entry.notes, entry.total_alerts,
    )


@app.get("/api/wazuh/suppression-log/export")
async def export_suppression_log():
    rows = db_module.get_all()
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["id", "created_at", "rule_id", "description",
                    "alert_count", "reduction_pct", "notes", "total_alerts"],
    )
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=suppression_log.csv"},
    )


# ── Changelog ──────────────────────────────────────────────────────────────────

@app.get("/api/changelog")
async def list_changelog():
    return db_module.get_changelog()


@app.post("/api/changelog")
async def create_changelog_entry(entry: SuppressionLogIn):
    return db_module.add_changelog_entry(
        entry.rule_id, entry.description, entry.alert_count,
        entry.reduction_pct, entry.notes, entry.total_alerts,
    )


@app.get("/api/changelog/export")
async def export_changelog():
    rows = db_module.get_changelog()
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["id", "created_at", "rule_id", "description",
                    "alert_count", "reduction_pct", "notes", "total_alerts"],
    )
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=changelog.csv"},
    )


# ── Config ─────────────────────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return {"ninja_web_url": os.getenv("NINJA_WEB_URL", "")}


# ── NinjaOne ───────────────────────────────────────────────────────────────────

@app.get("/api/ninja/devices")
async def get_ninja_devices():
    try:
        return await ninja.get_devices()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/ninja/patches")
async def get_ninja_patches():
    try:
        return await ninja.get_patch_summary()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/ninja/patches/debug")
async def debug_ninja_patches():
    """Returns raw NinjaOne patch API responses for debugging."""
    out = {}
    try:
        os_data = await ninja._get("/api/v2/queries/os-patch-installs", {"pageSize": 5})
        out["os_sample"] = os_data
    except Exception as e:
        out["os_error"] = str(e)
    try:
        sw_data = await ninja._get("/api/v2/queries/software-patch-installs", {"pageSize": 5})
        out["sw_sample"] = sw_data
    except Exception as e:
        out["sw_error"] = str(e)
    return out


@app.get("/api/ninja/activities")
async def get_ninja_activities(
    device_id: str = Query(None),
    activity_type: str = Query(None),
):
    try:
        return await ninja.get_activities(device_id, activity_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/ninja/refresh")
async def refresh_ninja():
    for key in list(cache._cache.keys()):
        if key.startswith("ninja"):
            cache.invalidate(key)
    return {"status": "ok"}


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def api_get_settings():
    raw = db_module.get_settings_raw()
    return {
        "notifications_enabled":  raw["notifications_enabled"]  == "true",
        "notify_critical":        raw["notify_critical"]         == "true",
        "notify_high":            raw["notify_high"]             == "true",
        "notify_medium":          raw["notify_medium"]           == "true",
        "notify_low":             raw["notify_low"]              == "true",
        "notification_cooldown":  int(raw["notification_cooldown"]),
        "agent_green_minutes":    int(raw["agent_green_minutes"]),
        "agent_yellow_minutes":   int(raw["agent_yellow_minutes"]),
        "offline_yellow_hours":   int(raw["offline_yellow_hours"]),
        "offline_orange_hours":   int(raw["offline_orange_hours"]),
        "fleet_green_pct":        int(raw["fleet_green_pct"]),
        "fleet_amber_pct":        int(raw["fleet_amber_pct"]),
        "patch_yellow_days":      int(raw["patch_yellow_days"]),
        "patch_orange_days":      int(raw["patch_orange_days"]),
        "cve_keywords":           json.loads(raw["cve_keywords"]),
        "default_theme":          raw["default_theme"],
        "default_time_window":    raw["default_time_window"],
        "auto_refresh_interval":  int(raw["auto_refresh_interval"]),
        "noisy_rules_page_size":  int(raw["noisy_rules_page_size"]),
        "alerts_page_size":       int(raw["alerts_page_size"]),
        # SMTP
        "smtp_enabled":           raw.get("smtp_enabled", "false") == "true",
        "smtp_host":              raw.get("smtp_host", ""),
        "smtp_port":              int(raw.get("smtp_port", "587")),
        "smtp_username":          raw.get("smtp_username", ""),
        "smtp_password":          raw.get("smtp_password", ""),
        "smtp_from_email":        raw.get("smtp_from_email", ""),
        "smtp_from_name":         raw.get("smtp_from_name", "OPS Dashboard"),
        "smtp_tls":               raw.get("smtp_tls", "true") == "true",
        # Email alert notifications
        "email_alerts_enabled":   raw.get("email_alerts_enabled",  "false") == "true",
        "email_alert_to":         raw.get("email_alert_to",        ""),
        "email_notify_critical":  raw.get("email_notify_critical", "true")  == "true",
        "email_notify_high":      raw.get("email_notify_high",     "true")  == "true",
        "email_notify_medium":    raw.get("email_notify_medium",   "false") == "true",
        "email_notify_low":       raw.get("email_notify_low",      "false") == "true",
        "email_cooldown_minutes": int(raw.get("email_cooldown_minutes", "15")),
        # From environment (informational, never persisted to DB)
        "wazuh_url_display":      os.getenv("WAZUH_URL", ""),
        "wazuh_username_display": os.getenv("WAZUH_USERNAME", ""),
        "ninja_url_display":      os.getenv("NINJA_URL", ""),
        "wazuh_configured":       bool(os.getenv("WAZUH_URL")),
        "ninja_configured":       bool(os.getenv("NINJA_URL")),
    }


class SettingsIn(BaseModel):
    notifications_enabled:  Optional[bool]  = None
    notify_critical:        Optional[bool]  = None
    notify_high:            Optional[bool]  = None
    notify_medium:          Optional[bool]  = None
    notify_low:             Optional[bool]  = None
    notification_cooldown:  Optional[int]   = None
    agent_green_minutes:    Optional[int]   = None
    agent_yellow_minutes:   Optional[int]   = None
    offline_yellow_hours:   Optional[int]   = None
    offline_orange_hours:   Optional[int]   = None
    fleet_green_pct:        Optional[int]   = None
    fleet_amber_pct:        Optional[int]   = None
    patch_yellow_days:      Optional[int]   = None
    patch_orange_days:      Optional[int]   = None
    cve_keywords:           Optional[list]  = None
    default_theme:          Optional[str]   = None
    default_time_window:    Optional[str]   = None
    auto_refresh_interval:  Optional[int]   = None
    noisy_rules_page_size:  Optional[int]   = None
    alerts_page_size:       Optional[int]   = None
    smtp_enabled:           Optional[bool]  = None
    smtp_host:              Optional[str]   = None
    smtp_port:              Optional[int]   = None
    smtp_username:          Optional[str]   = None
    smtp_password:          Optional[str]   = None
    smtp_from_email:        Optional[str]   = None
    smtp_from_name:         Optional[str]   = None
    smtp_tls:               Optional[bool]  = None
    email_alerts_enabled:   Optional[bool]  = None
    email_alert_to:         Optional[str]   = None
    email_notify_critical:  Optional[bool]  = None
    email_notify_high:      Optional[bool]  = None
    email_notify_medium:    Optional[bool]  = None
    email_notify_low:       Optional[bool]  = None
    email_cooldown_minutes: Optional[int]   = None


@app.post("/api/settings")
async def api_save_settings(body: SettingsIn):
    updates: dict[str, str] = {}
    bools = ["notifications_enabled", "notify_critical", "notify_high",
             "notify_medium", "notify_low"]
    ints  = ["notification_cooldown", "agent_green_minutes", "agent_yellow_minutes",
             "offline_yellow_hours", "offline_orange_hours", "fleet_green_pct",
             "fleet_amber_pct", "patch_yellow_days", "patch_orange_days",
             "auto_refresh_interval", "noisy_rules_page_size", "alerts_page_size"]
    strs  = ["default_theme", "default_time_window",
             "smtp_host", "smtp_username", "smtp_password",
             "smtp_from_email", "smtp_from_name"]
    bools += ["smtp_enabled", "smtp_tls",
              "email_alerts_enabled", "email_notify_critical",
              "email_notify_high", "email_notify_medium", "email_notify_low"]
    ints  += ["smtp_port", "email_cooldown_minutes"]
    strs  += ["email_alert_to"]

    for f in bools:
        v = getattr(body, f)
        if v is not None:
            updates[f] = "true" if v else "false"
    for f in ints:
        v = getattr(body, f)
        if v is not None:
            updates[f] = str(v)
    for f in strs:
        v = getattr(body, f)
        if v is not None:
            updates[f] = v
    if body.cve_keywords is not None:
        updates["cve_keywords"] = json.dumps(body.cve_keywords)

    if updates:
        db_module.save_settings(updates)
    return {"ok": True}


# ── Connection tests ───────────────────────────────────────────────────────────

@app.post("/api/test-connection/wazuh")
async def test_wazuh_connection():
    t0 = time.time()
    try:
        await wazuh.auth.get_token()
        ms = int((time.time() - t0) * 1000)
        return {
            "status": "connected",
            "latency_ms": ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return {"status": "failed", "latency_ms": ms, "error": str(e)}


@app.post("/api/test-connection/ninja")
async def test_ninja_connection():
    t0 = time.time()
    try:
        await ninja.auth.get_token()
        ms = int((time.time() - t0) * 1000)
        return {
            "status": "connected",
            "latency_ms": ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return {"status": "failed", "latency_ms": ms, "error": str(e)}


# ── Email ─────────────────────────────────────────────────────────────────────

class TestEmailIn(BaseModel):
    to: str

class InviteEmailIn(BaseModel):
    to: str
    password: str
    dashboard_url: str = ""

@app.post("/api/email/test")
async def send_test_email(body: TestEmailIn):
    try:
        email_client.send_test_email(body.to)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/users/{username}/invite")
async def send_invite_email(username: str, body: InviteEmailIn):
    if not db_module.get_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        url = body.dashboard_url or "https://security.mes.suntado.com"
        email_client.send_invite(body.to, username, body.password, url)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Threat Intelligence (NVD CVE Feed) ────────────────────────────────────────

NVD_BASE      = "https://services.nvd.nist.gov/rest/json/cves/2.0"
NVD_CACHE_TTL = 1800  # 30 minutes


def _get_cvss(item: dict) -> tuple[float, str, dict]:
    metrics = item.get("cve", {}).get("metrics", {})
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        mlist = metrics.get(key, [])
        if not mlist:
            continue
        primary = next((m for m in mlist if m.get("type") == "Primary"), mlist[0])
        d = primary.get("cvssData", {})
        score = float(d.get("baseScore", 0))
        sev = d.get("baseSeverity", "")
        if not sev:
            sev = ("CRITICAL" if score >= 9 else "HIGH" if score >= 7
                   else "MEDIUM" if score >= 4 else "LOW")
        detail = {
            "version":            key[-2:].replace("V2", "2.0"),
            "vector":             d.get("vectorString", ""),
            "attackVector":       d.get("attackVector", ""),
            "attackComplexity":   d.get("attackComplexity", ""),
            "privilegesRequired": d.get("privilegesRequired", ""),
            "userInteraction":    d.get("userInteraction", ""),
            "scope":              d.get("scope", ""),
            "confidentiality":    d.get("confidentialityImpact", ""),
            "integrity":          d.get("integrityImpact", ""),
            "availability":       d.get("availabilityImpact", ""),
            "exploitabilityScore": primary.get("exploitabilityScore"),
            "impactScore":         primary.get("impactScore"),
        }
        return score, sev.upper(), detail
    return 0.0, "UNKNOWN", {}


def _extract_cpe_tokens(item: dict) -> list[str]:
    seen: set[str] = set()
    for config in item.get("cve", {}).get("configurations", []):
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", []):
                parts = match.get("criteria", "").split(":")
                if len(parts) > 4:
                    for p in (parts[3], parts[4]):
                        token = p.replace("_", " ").strip()
                        if token and token != "*":
                            seen.add(token.lower())
    return list(seen)


def _match_devices(item: dict, ninja_devs: list, desc: str) -> list[dict]:
    tokens  = _extract_cpe_tokens(item)
    desc_l  = desc.lower()
    results = []
    for dev in ninja_devs:
        os_name  = ((dev.get("os") or {}).get("name") or "").lower()
        sys_name = ((dev.get("system") or {}).get("name") or "").lower()
        cls      = (dev.get("nodeClass") or "").lower()
        fp       = f"{os_name} {sys_name} {cls}"

        hit = any(len(t) >= 4 and t in fp for t in tokens)
        if not hit:
            if   "windows" in desc_l and "windows"  in os_name: hit = True
            elif "macos"   in desc_l and "mac"       in os_name: hit = True
            elif "linux"   in desc_l and "linux"     in os_name: hit = True

        if hit:
            results.append({
                "id":          dev.get("id"),
                "systemName":  (dev.get("systemName") or dev.get("displayName")
                                or f"Device {dev.get('id')}"),
                "offline":     dev.get("offline", False),
                "lastContact": dev.get("lastContact"),
                "os":          (dev.get("os") or {}).get("name", ""),
            })
    return results


def _remediation_effort(item: dict) -> str:
    for ref in item.get("cve", {}).get("references", []):
        tags = [t.lower() for t in ref.get("tags", [])]
        if "patch" in tags or "vendor advisory" in tags:
            return "Patch Available"
        if "mitigation" in tags or "workaround" in tags:
            return "Workaround Only"
    return "No Fix Available"


def _has_exploit(item: dict) -> bool:
    for ref in item.get("cve", {}).get("references", []):
        tags = [t.lower() for t in ref.get("tags", [])]
        if "exploit" in tags or "cisa-gov" in ref.get("url", "").lower():
            return True
    return False


async def _fetch_nvd_keyword(keyword: str, days_back: int, client: httpx.AsyncClient) -> list:
    cache_key = f"nvd_{keyword}_{days_back}"
    hit = cache.get(cache_key)
    if hit is not None:
        return hit

    end_dt   = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days_back)
    params   = {
        "keywordSearch":  keyword,
        "pubStartDate":   start_dt.strftime("%Y-%m-%dT%H:%M:%S.000"),
        "pubEndDate":     end_dt.strftime("%Y-%m-%dT%H:%M:%S.000"),
        "resultsPerPage": "100",
    }
    try:
        resp = await client.get(NVD_BASE, params=params)
        resp.raise_for_status()
        items = resp.json().get("vulnerabilities", [])
    except Exception as e:
        logger.warning(f"NVD fetch failed for '{keyword}': {e}")
        return []

    cache.set(cache_key, items, ttl=NVD_CACHE_TTL)
    return items


async def _get_wazuh_cve_ids() -> set[str]:
    cached = cache.get("wazuh_cve_rule_ids")
    if cached is not None:
        return cached
    try:
        data  = await wazuh._mgr_get("/rules", {"limit": 500, "search": "CVE-"})
        rules = data.get("data", {}).get("affected_items", [])
        pat   = re.compile(r"CVE-\d{4}-\d+", re.IGNORECASE)
        found: set[str] = set()
        for rule in rules:
            for m in pat.findall(rule.get("description", "")):
                found.add(m.upper())
        cache.set("wazuh_cve_rule_ids", found, ttl=3600)
        return found
    except Exception as e:
        logger.warning(f"Wazuh CVE rule fetch failed: {e}")
        return set()


@app.get("/api/threat-intel/cves")
async def api_threat_intel_cves(
    days_back:     int  = Query(7,     ge=1, le=90),
    severity:      str  = Query("all"),
    keyword:       str  = Query("all"),
    device_filter: bool = Query(False),
):
    raw     = db_module.get_settings_raw()
    kw_cfg: list[dict] = json.loads(raw["cve_keywords"])
    all_kws = [k["keyword"] for k in kw_cfg if k.get("enabled")]
    target  = [keyword] if keyword != "all" and keyword in all_kws else all_kws

    if not target:
        return {"cves": [], "device_exposure": [], "keyword_count": 0,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "fetch_errors": [], "total_critical": 0, "total_high": 0,
                "total_medium": 0, "total_low": 0, "total_affecting_devices": 0}

    errors: list[str] = []
    raw_by_id: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=60.0) as client:
        for i, kw in enumerate(target):
            if i > 0:
                await asyncio.sleep(1.5)   # NVD rate limit: 5 req / 30 s
            try:
                items = await _fetch_nvd_keyword(kw, days_back, client)
            except Exception as e:
                errors.append(f"{kw}: {e}")
                continue
            for item in items:
                cid = item.get("cve", {}).get("id", "")
                if not cid:
                    continue
                if cid not in raw_by_id:
                    raw_by_id[cid] = {**item, "_kw": kw}
                else:
                    prev = raw_by_id[cid].get("_kw", "")
                    if kw not in prev:
                        raw_by_id[cid]["_kw"] = f"{prev}, {kw}"

    try:
        ninja_devs = await ninja.get_devices()
    except Exception:
        ninja_devs = []

    wazuh_ids = await _get_wazuh_cve_ids()

    SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}
    processed: list[dict] = []

    for cid, item in raw_by_id.items():
        cve_data = item.get("cve", {})
        desc_en  = next(
            (d["value"] for d in cve_data.get("descriptions", []) if d.get("lang") == "en"), ""
        )
        score, sev, cvss  = _get_cvss(item)
        aff_devs          = _match_devices(item, ninja_devs, desc_en)
        effort            = _remediation_effort(item)

        processed.append({
            "cve_id":           cid,
            "published":        cve_data.get("published", ""),
            "last_modified":    cve_data.get("lastModified", ""),
            "vuln_status":      cve_data.get("vulnStatus", ""),
            "description":      desc_en,
            "severity":         sev.lower(),
            "cvss_score":       score,
            "cvss_detail":      cvss,
            "affected_products": _extract_cpe_tokens(item),
            "keyword":          item.get("_kw", ""),
            "references":       cve_data.get("references", []),
            "weaknesses":       [
                w["description"][0]["value"]
                for w in cve_data.get("weaknesses", [])
                if w.get("description")
            ],
            "affected_devices":   aff_devs,
            "has_wazuh_coverage": cid.upper() in wazuh_ids,
            "remediation_effort": effort,
            "has_known_exploit":  _has_exploit(item),
        })

    if severity != "all":
        processed = [c for c in processed if c["severity"] == severity.lower()]
    if device_filter:
        processed = [c for c in processed if c["affected_devices"]]

    processed.sort(key=lambda c: (
        SEV_ORDER.get(c["severity"].upper(), 4),
        -c["cvss_score"],
        c["published"],
    ))

    tc = sum(1 for c in processed if c["severity"] == "critical")
    th = sum(1 for c in processed if c["severity"] == "high")
    tm = sum(1 for c in processed if c["severity"] == "medium")
    tl = sum(1 for c in processed if c["severity"] == "low")
    td = sum(1 for c in processed if c["affected_devices"])

    dev_map: dict[str, dict] = {}
    for cve in processed:
        for dev in cve["affected_devices"]:
            name = dev["systemName"]
            if name not in dev_map:
                dev_map[name] = {"device": dev, "critical": 0, "high": 0,
                                 "medium": 0, "low": 0, "cve_count": 0}
            sk = cve["severity"]
            if sk in dev_map[name]:
                dev_map[name][sk] += 1
            dev_map[name]["cve_count"] += 1

    exposure = sorted(
        dev_map.values(),
        key=lambda d: -(d["critical"]*1000 + d["high"]*100 + d["medium"]*10 + d["low"])
    )

    # Determine last_updated from cache
    last_ts = datetime.now(timezone.utc)
    for kw in target:
        entry = cache._cache.get(f"nvd_{kw}_{days_back}")
        if entry:
            _, exp = entry
            ts = datetime.fromtimestamp(exp - NVD_CACHE_TTL, tz=timezone.utc)
            if ts < last_ts:
                last_ts = ts

    return {
        "cves":                    processed,
        "device_exposure":         exposure,
        "last_updated":            last_ts.isoformat(),
        "keyword_count":           len(target),
        "fetch_errors":            errors,
        "total_critical":          tc,
        "total_high":              th,
        "total_medium":            tm,
        "total_low":               tl,
        "total_affecting_devices": td,
    }


@app.post("/api/threat-intel/refresh")
async def api_threat_intel_refresh():
    for key in list(cache._cache.keys()):
        if key.startswith("nvd_"):
            cache.invalidate(key)
    cache.invalidate("wazuh_cve_rule_ids")
    return {"status": "ok"}


# ── Static frontend (production build) ────────────────────────────────────────

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # reload=True causes module-path issues on Windows
    )
