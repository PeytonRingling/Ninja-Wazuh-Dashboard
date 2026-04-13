import csv
import io
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Ensure backend/ is always first on sys.path so imports work regardless of CWD
_backend_dir = str(Path(__file__).parent.resolve())
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Globals populated at startup
wazuh: WazuhClient = None
ninja: NinjaClient = None


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

    # Initialize suppression log DB
    db_module.init_db()

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

    yield


app = FastAPI(title="IT Operations Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
