import logging
from typing import Any
import httpx
from auth import NinjaAuth
import cache

logger = logging.getLogger(__name__)


class NinjaClient:
    def __init__(self, auth: NinjaAuth):
        self.auth = auth
        self.base_url = auth.base_url

    async def _get(self, path: str, params: dict = None) -> Any:
        headers = await self.auth.headers()
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}{path}",
                headers=headers,
                params=params or {},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_devices(self) -> list:
        cached = cache.get("ninja_devices")
        if cached:
            return cached

        try:
            data = await self._get("/api/v2/devices-detailed", {"pageSize": 500})
            devices = data if isinstance(data, list) else data.get("devices", data.get("results", []))
            cache.set("ninja_devices", devices)
            return devices
        except Exception as e:
            logger.error(f"NinjaOne devices error: {e}")
            raise

    async def get_summary(self) -> dict:
        cached = cache.get("ninja_summary")
        if cached:
            return cached

        try:
            devices = await self.get_devices()
            online = sum(1 for d in devices if _is_online(d))
            offline = len(devices) - online
            result = {
                "total": len(devices),
                "online": online,
                "offline": offline,
            }
            cache.set("ninja_summary", result)
            return result
        except Exception as e:
            logger.error(f"NinjaOne summary error: {e}")
            raise

    async def get_patch_summary(self) -> dict:
        cached = cache.get("ninja_patches")
        if cached:
            return cached

        try:
            async def _fetch_patches(endpoint: str, patch_type: str) -> list:
                results = []
                for status in ("FAILED", "APPROVED", "PENDING_REBOOT"):
                    try:
                        d = await self._get(endpoint, {"status": status, "pageSize": 1000})
                        raw = d if isinstance(d, list) else d.get("results", [])
                        if raw:
                            actual = raw[0].get("status", "?")
                            logger.info(f"{endpoint} status={status}: {len(raw)} records (actual status field: {actual!r})")
                        else:
                            logger.info(f"{endpoint} status={status}: 0 records")
                        for p in raw:
                            results.append({
                                "deviceId": p.get("deviceId"),
                                "name": p.get("name") or "—",
                                "identifier": p.get("kbNumber") or p.get("identifier") or "",
                                "status": status,  # use the query status — NinjaOne may not echo it reliably
                                "severity": p.get("severity") or "—",
                                "type": patch_type,
                                "installedAt": p.get("installedAt"),
                            })
                    except Exception as e:
                        logger.warning(f"{endpoint} status={status} error: {e}")
                return results

            os_patches = await _fetch_patches("/api/v2/queries/os-patch-installs", "OS")
            sw_patches = await _fetch_patches("/api/v2/queries/software-patch-installs", "Software")
            patches = os_patches + sw_patches
            logger.info(f"Total patch records: {len(patches)} (OS: {len(os_patches)}, SW: {len(sw_patches)})")

            devices = await self.get_devices()
            total_devices = len(devices)

            PENDING_STATUSES = {"APPROVED", "PENDING_REBOOT", "NEEDS_UPDATE", "MANUAL", "PENDING"}

            failed_device_ids = {p["deviceId"] for p in patches if p["status"] == "FAILED"}
            pending_device_ids = {p["deviceId"] for p in patches if p["status"] in PENDING_STATUSES}

            failed_count = len(failed_device_ids)
            pending_count = len(pending_device_ids - failed_device_ids)
            patched_count = total_devices - failed_count - pending_count
            logger.info(f"Patch counts — failed devices: {failed_count}, pending devices: {pending_count}, patched: {patched_count}")

            # Normalise status label for frontend
            for p in patches:
                if p["status"] in PENDING_STATUSES:
                    p["status"] = "NEEDS_UPDATE"

            result = {
                "total_devices": total_devices,
                "fully_patched": max(0, patched_count),
                "patches_pending": pending_count,
                "patches_failed": failed_count,
                "patch_details": patches[:500],
            }
            cache.set("ninja_patches", result)
            return result
        except Exception as e:
            logger.error(f"NinjaOne patches error: {e}")
            raise

    async def get_activities(self, device_id: str = None, activity_type: str = None) -> list:
        cache_key = f"ninja_activities_{device_id}_{activity_type}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            params: dict = {"pageSize": 200}
            if device_id:
                params["deviceId"] = device_id
            if activity_type:
                params["activityType"] = activity_type

            data = await self._get("/api/v2/activities", params)
            activities = data if isinstance(data, list) else data.get("activities", data.get("results", []))
            cache.set(cache_key, activities)
            return activities
        except Exception as e:
            logger.error(f"NinjaOne activities error: {e}")
            raise


def _is_online(device: dict) -> bool:
    # NinjaOne devices-detailed uses "offline" field (false = online, true = offline)
    offline = device.get("offline")
    if offline is not None:
        return not bool(offline)
    # Fall back to lastContact recency check
    import time
    last_contact = device.get("lastContact") or device.get("lastSeenAt")
    if last_contact:
        try:
            ts = float(last_contact)
            # timestamps are in seconds (not ms) for NinjaOne
            ts_sec = ts / 1000 if ts > 1e12 else ts
            return time.time() - ts_sec < 600
        except Exception:
            pass
    return False
