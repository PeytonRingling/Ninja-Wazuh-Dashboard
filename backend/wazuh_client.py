import logging
from datetime import datetime, timezone
from typing import Any
import httpx
from auth import WazuhAuth
from indexer_client import IndexerClient
import cache

logger = logging.getLogger(__name__)

LEVEL_RANGES = {
    "critical": {"gte": 15},
    "high":     {"gte": 12, "lt": 15},
    "medium":   {"gte": 7,  "lt": 12},
    "low":      {"lt": 7},
}


def _severity(level: int) -> str:
    if level >= 15: return "critical"
    if level >= 12: return "high"
    if level >= 7:  return "medium"
    return "low"


class WazuhClient:
    def __init__(self, auth: WazuhAuth, indexer: IndexerClient):
        self.auth = auth
        self.base_url = auth.base_url
        self.indexer = indexer

    # ── Manager API (agents only) ─────────────────────────────────────────────

    async def _mgr_get(self, path: str, params: dict = None) -> Any:
        headers = await self.auth.headers()
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}{path}",
                headers=headers,
                params=params or {},
            )
            resp.raise_for_status()
            return resp.json()

    # ── Summary (top bar) ─────────────────────────────────────────────────────

    async def get_summary(self) -> dict:
        cached = cache.get("wazuh_summary")
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {"range": {"timestamp": {"gte": "now-24h"}}},
            "aggs": {
                "by_level": {
                    "range": {
                        "field": "rule.level",
                        "ranges": [
                            {"key": "critical", "from": 15},
                            {"key": "high",     "from": 12, "to": 15},
                            {"key": "medium",   "from": 7,  "to": 12},
                            {"key": "low",      "to": 7},
                        ],
                    }
                }
            },
        })

        totals = {
            b["key"]: b["doc_count"]
            for b in result["aggregations"]["by_level"]["buckets"]
        }
        totals["total"] = sum(totals.values())
        cache.set("wazuh_summary", totals, ttl=60)
        return totals

    # ── Alert volume chart ────────────────────────────────────────────────────

    async def get_alert_volume(self, timeframe: str = "24h") -> list:
        cache_key = f"wazuh_alert_volume_{timeframe}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        if timeframe == "24h":
            gte, interval = "now-24h", "1h"
        elif timeframe == "7d":
            gte, interval = "now-7d", "1d"
        else:
            gte, interval = "now-30d", "1d"

        result = await self.indexer.search({
            "size": 0,
            "query": {"range": {"timestamp": {"gte": gte}}},
            "aggs": {
                "over_time": {
                    "date_histogram": {
                        "field": "timestamp",
                        "fixed_interval": interval,
                        "min_doc_count": 0,
                    },
                    "aggs": {
                        "critical": {"filter": {"range": {"rule.level": {"gte": 15}}}},
                        "high":     {"filter": {"range": {"rule.level": {"gte": 12, "lt": 15}}}},
                        "medium":   {"filter": {"range": {"rule.level": {"gte": 7,  "lt": 12}}}},
                        "low":      {"filter": {"range": {"rule.level": {"lt": 7}}}},
                    },
                }
            },
        })

        buckets = []
        for b in result["aggregations"]["over_time"]["buckets"]:
            ts = datetime.fromtimestamp(
                b["key"] / 1000, tz=timezone.utc
            ).isoformat()
            buckets.append({
                "time": ts,
                "critical": b["critical"]["doc_count"],
                "high":     b["high"]["doc_count"],
                "medium":   b["medium"]["doc_count"],
                "low":      b["low"]["doc_count"],
            })

        cache.set(cache_key, buckets, ttl=120)
        return buckets

    # ── Noisy rules ───────────────────────────────────────────────────────────

    async def get_noisy_rules(self, hours_back: int = 24) -> list:
        cache_key = f"wazuh_noisy_rules_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {"range": {"timestamp": {"gte": f"now-{hours_back}h"}}},
            "aggs": {
                "top_rules": {
                    "terms": {
                        "field": "rule.id",
                        "size": 20,
                        "order": {"_count": "desc"},
                    },
                    "aggs": {
                        "description": {"terms": {"field": "rule.description", "size": 1}},
                        "max_level":   {"max": {"field": "rule.level"}},
                    },
                }
            },
        })

        rules = []
        for b in result["aggregations"]["top_rules"]["buckets"]:
            level = int(b["max_level"]["value"] or 0)
            desc_buckets = b["description"]["buckets"]
            description = desc_buckets[0]["key"] if desc_buckets else "—"
            rules.append({
                "rule_id":      b["key"],
                "description":  description,
                "level":        level,
                "severity":     _severity(level),
                "alert_count":  b["doc_count"],
                "last_triggered": "",
            })

        cache.set(cache_key, rules, ttl=120)
        return rules

    # ── Alerts ────────────────────────────────────────────────────────────────

    async def get_alerts(
        self,
        limit: int = 100,
        offset: int = 0,
        severity: str = None,
        agent: str = None,
        rule_id: str = None,
        hours_back: int = 24,
    ) -> dict:
        must = [{"range": {"timestamp": {"gte": f"now-{hours_back}h"}}}]

        if severity and severity in LEVEL_RANGES:
            must.append({"range": {"rule.level": LEVEL_RANGES[severity]}})
        if agent:
            must.append({"match": {"agent.name": agent}})
        if rule_id:
            must.append({"term": {"rule.id": rule_id}})

        result = await self.indexer.search({
            "size": limit,
            "from": offset,
            "sort": [{"timestamp": {"order": "desc"}}],
            "query": {"bool": {"must": must}},
            "_source": [
                "timestamp", "id",
                "agent.*", "manager.*", "decoder.*", "input.*", "location",
                "rule.*",
                "data.*",
            ],
        })

        alerts = []
        for hit in result["hits"]["hits"]:
            src = hit["_source"]
            src["id"] = src.get("id") or hit["_id"]
            alerts.append(src)

        total = result["hits"]["total"]["value"]
        return {"total": total, "alerts": alerts, "source": "indexer"}

    # ── Per-agent alert summary (for Endpoint Intel tab) ─────────────────────

    async def get_agent_alert_summary(self, hours_back: int = 24) -> list:
        cache_key = f"wazuh_agent_summary_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {"range": {"timestamp": {"gte": f"now-{hours_back}h"}}},
            "aggs": {
                "by_agent": {
                    "terms": {"field": "agent.name", "size": 200},
                    "aggs": {
                        "critical": {"filter": {"range": {"rule.level": {"gte": 15}}}},
                        "high":     {"filter": {"range": {"rule.level": {"gte": 12, "lt": 15}}}},
                        "medium":   {"filter": {"range": {"rule.level": {"gte": 7,  "lt": 12}}}},
                        "low":      {"filter": {"range": {"rule.level": {"lt": 7}}}},
                        "latest":   {
                            "top_hits": {
                                "size": 1,
                                "sort": [{"timestamp": {"order": "desc"}}],
                                "_source": ["rule.description", "timestamp", "rule.level"],
                            }
                        },
                    },
                }
            },
        })

        summary = []
        for b in result["aggregations"]["by_agent"]["buckets"]:
            hits = b["latest"]["hits"]["hits"]
            latest = None
            if hits:
                src = hits[0]["_source"]
                rule = src.get("rule", {})
                latest = {
                    "description": rule.get("description"),
                    "timestamp":   src.get("timestamp"),
                    "level":       rule.get("level"),
                }
            summary.append({
                "agent_name": b["key"],
                "total":      b["doc_count"],
                "critical":   b["critical"]["doc_count"],
                "high":       b["high"]["doc_count"],
                "medium":     b["medium"]["doc_count"],
                "low":        b["low"]["doc_count"],
                "latest":     latest,
            })

        cache.set(cache_key, summary, ttl=120)
        return summary

    # ── Agents (manager API) ──────────────────────────────────────────────────

    async def get_agents(self) -> list:
        cached = cache.get("wazuh_agents")
        if cached:
            return cached
        data = await self._mgr_get("/agents", {"limit": 500})
        agents = data.get("data", {}).get("affected_items", [])
        cache.set("wazuh_agents", agents, ttl=120)
        return agents
