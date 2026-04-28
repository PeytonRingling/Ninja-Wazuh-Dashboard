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

    async def _mgr_put(self, path: str, body: dict = None) -> Any:
        headers = await self.auth.headers()
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            resp = await client.put(
                f"{self.base_url}{path}",
                headers=headers,
                json=body or {},
            )
            resp.raise_for_status()
            return resp.json()

    async def restart_agent(self, agent_id: str) -> dict:
        return await self._mgr_put(f"/agents/{agent_id}/restart")

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

    async def get_noisy_rules(self, hours_back: float = 24) -> list:
        cache_key = f"wazuh_noisy_rules_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {"range": {"timestamp": {"gte": f"now-{int(hours_back * 60)}m"}}},
            "aggs": {
                "top_rules": {
                    "terms": {
                        "field": "rule.id",
                        "size": 500,
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
        hours_back: float = 24,
    ) -> dict:
        must = [{"range": {"timestamp": {"gte": f"now-{int(hours_back * 60)}m"}}}]

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
                "syscheck.*",
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

    async def get_agent_alert_summary(self, hours_back: float = 24) -> list:
        cache_key = f"wazuh_agent_summary_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {"range": {"timestamp": {"gte": f"now-{int(hours_back * 60)}m"}}},
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

    # ── Rule breakdown (drill-down) ───────────────────────────────────────────

    async def get_rule_breakdown(self, rule_id: str, hours_back: float = 24) -> dict:
        cache_key = f"wazuh_rule_breakdown_{rule_id}_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {"range": {"timestamp": {"gte": f"now-{int(hours_back * 60)}m"}}},
                        {"term": {"rule.id": rule_id}},
                    ]
                }
            },
            "aggs": {
                # Per-field top values — adapts to rule type (FIM, Windows event, PAM, etc.)
                "top_agents":          {"terms": {"field": "agent.name",                        "size": 20}},
                "top_event_ids":       {"terms": {"field": "data.win.system.eventID",            "size": 10}},
                "top_users":           {"terms": {"field": "data.win.eventdata.subjectUserName", "size": 10}},
                "top_src_ips":         {"terms": {"field": "data.srcip",                         "size": 10}},
                # FIM / syscheck fields
                "top_syscheck_paths":  {"terms": {"field": "syscheck.path",                      "size": 20}},
                "top_syscheck_events": {"terms": {"field": "syscheck.event",                     "size": 5}},
                # Auth / generic data fields
                "top_srcusers":        {"terms": {"field": "data.srcuser",                       "size": 10}},
                "top_decoders":        {"terms": {"field": "decoder.name",                       "size": 10}},
                "top_locations":       {"terms": {"field": "location",                           "size": 15}},
                # Hourly activity chart
                "hourly": {
                    "date_histogram": {
                        "field": "timestamp",
                        "fixed_interval": "1h",
                        "min_doc_count": 0,
                    }
                },
                # 10 most recent actual alerts — lets analyst see real content
                "samples": {
                    "top_hits": {
                        "size": 10,
                        "sort": [{"timestamp": {"order": "desc"}}],
                        "_source": [
                            "timestamp", "agent",
                            "decoder.name", "location",
                            "syscheck.path", "syscheck.event",
                            "data.srcuser",
                            "data.win.system.eventID", "data.win.system.channel",
                            "data.win.system.message", "data.win.system.providerName",
                            "data.win.eventdata.subjectUserName",
                            "data.win.eventdata.targetUserName",
                            "data.srcip",
                        ]
                    }
                },
            },
        })

        aggs = result["aggregations"]

        def buckets(key):
            return [
                {"value": b["key"], "count": b["doc_count"]}
                for b in aggs[key]["buckets"]
                if b["doc_count"] > 0
            ]

        hourly = [
            {
                "time": datetime.fromtimestamp(b["key"] / 1000, tz=timezone.utc).isoformat(),
                "count": b["doc_count"],
            }
            for b in aggs["hourly"]["buckets"]
        ]

        # Flatten sample alerts into a consistent shape
        sample_alerts = []
        for hit in aggs["samples"]["hits"]["hits"]:
            src = hit["_source"]
            win      = (src.get("data") or {}).get("win") or {}
            syscheck = src.get("syscheck") or {}
            sample_alerts.append({
                "timestamp":      src.get("timestamp"),
                "agent_name":     (src.get("agent") or {}).get("name"),
                "decoder":        (src.get("decoder") or {}).get("name"),
                "location":       src.get("location"),
                "syscheck_path":  syscheck.get("path"),
                "syscheck_event": syscheck.get("event"),
                "event_id":       (win.get("system") or {}).get("eventID"),
                "channel":        (win.get("system") or {}).get("channel"),
                "message":        (win.get("system") or {}).get("message"),
                "provider":       (win.get("system") or {}).get("providerName"),
                "user":           (win.get("eventdata") or {}).get("subjectUserName"),
                "tgt_user":       (win.get("eventdata") or {}).get("targetUserName"),
                "src_ip":         (src.get("data") or {}).get("srcip"),
                "srcuser":        (src.get("data") or {}).get("srcuser"),
            })

        breakdown = {
            "rule_id":             rule_id,
            "total":               result["hits"]["total"]["value"],
            "top_agents":          buckets("top_agents"),
            "top_event_ids":       buckets("top_event_ids"),
            "top_users":           buckets("top_users"),
            "top_src_ips":         buckets("top_src_ips"),
            "top_syscheck_paths":  buckets("top_syscheck_paths"),
            "top_syscheck_events": buckets("top_syscheck_events"),
            "top_srcusers":        buckets("top_srcusers"),
            "top_decoders":        buckets("top_decoders"),
            "top_locations":       buckets("top_locations"),
            "hourly_pattern":      hourly,
            "sample_alerts":       sample_alerts,
        }
        cache.set(cache_key, breakdown, ttl=60)
        return breakdown

    # ── Rule dimension detail (per-value drill-down) ─────────────────────────

    # Maps frontend field keys to OpenSearch field names
    _FIELD_MAP = {
        "agent":          "agent.name",
        "syscheck_path":  "syscheck.path",
        "syscheck_event": "syscheck.event",
        "event_id":       "data.win.system.eventID",
        "user":           "data.win.eventdata.subjectUserName",
        "srcuser":        "data.srcuser",
        "src_ip":         "data.srcip",
        "location":       "location",
        "decoder":        "decoder.name",
    }

    async def get_rule_dimension_detail(
        self, rule_id: str, field: str, value: str, hours_back: float = 24
    ) -> dict:
        es_field = self._FIELD_MAP.get(field)
        if not es_field:
            return {}

        cache_key = f"wazuh_dim_{rule_id}_{field}_{value}_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        result = await self.indexer.search({
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {"range": {"timestamp": {"gte": f"now-{int(hours_back * 60)}m"}}},
                        {"term": {"rule.id": rule_id}},
                        {"term": {es_field: value}},
                    ]
                }
            },
            "aggs": {
                "by_agent":               {"terms": {"field": "agent.name",                        "size": 10}},
                "by_syscheck_event":      {"terms": {"field": "syscheck.event",                    "size": 5}},
                "by_syscheck_path":       {"terms": {"field": "syscheck.path",                     "size": 10}},
                "by_value_name":          {"terms": {"field": "syscheck.value_name",               "size": 20}},
                "by_value_type":          {"terms": {"field": "syscheck.value_type",               "size": 10}},
                "by_changed_attributes":  {"terms": {"field": "syscheck.changed_attributes",       "size": 10}},
                "by_user":                {"terms": {"field": "data.win.eventdata.subjectUserName", "size": 5}},
                "by_event_id":            {"terms": {"field": "data.win.system.eventID",            "size": 5}},
                "by_location":            {"terms": {"field": "location",                          "size": 5}},
                "hourly": {
                    "date_histogram": {
                        "field": "timestamp",
                        "fixed_interval": "1h",
                        "min_doc_count": 0,
                    }
                },
                "first_seen": {"min": {"field": "timestamp"}},
                "last_seen":  {"max": {"field": "timestamp"}},
                # Sample alerts — pull message and syscheck detail fields
                "samples": {
                    "top_hits": {
                        "size": 5,
                        "sort": [{"timestamp": {"order": "desc"}}],
                        "_source": [
                            "timestamp", "agent", "manager.name",
                            # Rule metadata
                            "rule.description", "rule.level",
                            "rule.groups", "rule.mitre",
                            # FIM / syscheck fields
                            "syscheck.path", "syscheck.event",
                            "syscheck.value_name", "syscheck.value_type",
                            "syscheck.changed_attributes",
                            "syscheck.content_changes",
                            "syscheck.sha1_before", "syscheck.sha1_after",
                            "syscheck.md5_before", "syscheck.md5_after",
                            "syscheck.size_before", "syscheck.size_after",
                            "syscheck.mtime_after",
                            "syscheck.uname_after", "syscheck.gname_after",
                            "syscheck.perm_after",
                            # Windows event fields
                            "data.win.system.eventID",
                            "data.win.system.message",
                            "data.win.system.providerName",
                            "data.win.system.channel",
                            "data.win.eventdata.subjectUserName",
                            "data.win.eventdata.targetUserName",
                            "data.srcip", "data.srcuser",
                            "decoder.name", "location",
                        ]
                    }
                },
            },
        })

        aggs = result["aggregations"]

        def bkts(key):
            return [
                {"value": b["key"], "count": b["doc_count"]}
                for b in aggs[key]["buckets"]
                if b["doc_count"] > 0
            ]

        hourly = [
            {
                "time":  datetime.fromtimestamp(b["key"] / 1000, tz=timezone.utc).isoformat(),
                "count": b["doc_count"],
            }
            for b in aggs["hourly"]["buckets"]
        ]

        # Extract sample alerts with full syscheck + Windows event fields
        samples = []
        for hit in aggs["samples"]["hits"]["hits"]:
            src = hit["_source"]
            win      = (src.get("data") or {}).get("win") or {}
            syscheck = src.get("syscheck") or {}
            rule_meta = src.get("rule") or {}
            agent     = src.get("agent") or {}
            mitre     = rule_meta.get("mitre") or {}
            samples.append({
                "timestamp":                  src.get("timestamp"),
                "agent_name":                 agent.get("name"),
                "agent_ip":                   agent.get("ip"),
                "agent_id":                   agent.get("id"),
                "manager_name":               (src.get("manager") or {}).get("name"),
                "rule_description":           rule_meta.get("description"),
                "rule_level":                 rule_meta.get("level"),
                "rule_groups":                rule_meta.get("groups") or [],
                "mitre_ids":                  mitre.get("id") or [],
                "mitre_techniques":           mitre.get("technique") or [],
                "mitre_tactics":              mitre.get("tactic") or [],
                "decoder":                    (src.get("decoder") or {}).get("name"),
                "location":                   src.get("location"),
                "syscheck_path":              syscheck.get("path"),
                "syscheck_event":             syscheck.get("event"),
                "syscheck_value_name":        syscheck.get("value_name"),
                "syscheck_value_type":        syscheck.get("value_type"),
                "syscheck_changed_attributes": syscheck.get("changed_attributes"),
                "syscheck_content_changes":   syscheck.get("content_changes"),
                "syscheck_sha1_before":       syscheck.get("sha1_before"),
                "syscheck_sha1_after":        syscheck.get("sha1_after"),
                "syscheck_md5_before":        syscheck.get("md5_before"),
                "syscheck_md5_after":         syscheck.get("md5_after"),
                "syscheck_size_before":       syscheck.get("size_before"),
                "syscheck_size_after":        syscheck.get("size_after"),
                "syscheck_mtime_after":       syscheck.get("mtime_after"),
                "syscheck_uname_after":       syscheck.get("uname_after"),
                "syscheck_perm_after":        syscheck.get("perm_after"),
                "event_id":                   (win.get("system") or {}).get("eventID"),
                "channel":                    (win.get("system") or {}).get("channel"),
                "message":                    (win.get("system") or {}).get("message"),
                "provider":                   (win.get("system") or {}).get("providerName"),
                "user":                       (win.get("eventdata") or {}).get("subjectUserName"),
                "tgt_user":                   (win.get("eventdata") or {}).get("targetUserName"),
                "src_ip":                     (src.get("data") or {}).get("srcip"),
                "srcuser":                    (src.get("data") or {}).get("srcuser"),
            })

        detail = {
            "total":                  result["hits"]["total"]["value"],
            "by_agent":               bkts("by_agent"),
            "by_syscheck_event":      bkts("by_syscheck_event"),
            "by_syscheck_path":       bkts("by_syscheck_path"),
            "by_value_name":          bkts("by_value_name"),
            "by_value_type":          bkts("by_value_type"),
            "by_changed_attributes":  bkts("by_changed_attributes"),
            "by_user":                bkts("by_user"),
            "by_event_id":            bkts("by_event_id"),
            "by_location":            bkts("by_location"),
            "hourly":                 hourly,
            "first_seen":             aggs["first_seen"].get("value_as_string"),
            "last_seen":              aggs["last_seen"].get("value_as_string"),
            "samples":                samples,
        }
        cache.set(cache_key, detail, ttl=60)
        return detail

    # ── Rule detail (manager API) ─────────────────────────────────────────────

    async def get_rule_detail(self, rule_id: str) -> dict:
        cache_key = f"wazuh_rule_detail_{rule_id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            data = await self._mgr_get("/rules", {"rule_ids": rule_id})
            items = data.get("data", {}).get("affected_items", [])
            if not items:
                return {}

            item = items[0]

            # MITRE may live at top level or nested under details.mitre — check both
            mitre_top     = item.get("mitre") or {}
            mitre_details = (item.get("details") or {}).get("mitre") or {}
            mitre = mitre_top if mitre_top else mitre_details

            details = item.get("details") or {}
            result = {
                "id":          item.get("id"),
                "description": item.get("description", ""),
                "level":       item.get("level"),
                "filename":    item.get("filename", ""),
                "if_sid":      details.get("if_sid", ""),
                "groups":      item.get("groups", []),
                "pci_dss":     item.get("pci_dss", []),
                "nist_800_53": item.get("nist_800_53", []),
                "gdpr":        item.get("gdpr", []),
                "hipaa":       item.get("hipaa", []),
                "tsc":         item.get("tsc", []),
                "mitre": {
                    "id":        mitre.get("id", []),
                    "technique": mitre.get("technique", []),
                    "tactic":    mitre.get("tactic", []),
                },
            }

            cache.set(cache_key, result, ttl=300)
            return result

        except Exception as e:
            logger.warning(f"get_rule_detail({rule_id}) failed: {e}")
            return {}

    # ── Rule trend (7-day daily breakdown) ───────────────────────────────────

    async def get_rule_trend(self, rule_id: str) -> dict:
        cache_key = f"wazuh_trend_{rule_id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            result = await self.indexer.search({
                "size": 0,
                "query": {
                    "bool": {
                        "must": [
                            {"range": {"timestamp": {"gte": "now-7d"}}},
                            {"term": {"rule.id": rule_id}},
                        ]
                    }
                },
                "aggs": {
                    "daily": {
                        "date_histogram": {
                            "field": "timestamp",
                            "calendar_interval": "1d",
                            "min_doc_count": 0,
                        }
                    },
                    "top_processes": {
                        "terms": {"field": "data.win.eventdata.image", "size": 5}
                    },
                },
            })

            daily_buckets = result["aggregations"]["daily"]["buckets"]
            daily = [
                {
                    "date":  datetime.fromtimestamp(b["key"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d"),
                    "count": b["doc_count"],
                }
                for b in daily_buckets
            ]

            counts = [b["doc_count"] for b in daily_buckets]
            total_7d = result["hits"]["total"]["value"]

            # Trend: compare first half vs second half
            if len(counts) >= 4:
                mid = len(counts) // 2
                first_avg = sum(counts[:mid]) / mid
                last_avg  = sum(counts[mid:]) / (len(counts) - mid)
                if first_avg > 0:
                    change_pct = ((last_avg - first_avg) / first_avg) * 100
                else:
                    change_pct = 100.0 if last_avg > 0 else 0.0
                trend = "up" if change_pct > 15 else "down" if change_pct < -15 else "flat"
            else:
                change_pct = 0.0
                trend = "flat"

            top_processes = [
                {"value": b["key"].split("\\")[-1], "count": b["doc_count"]}
                for b in result["aggregations"]["top_processes"]["buckets"]
                if b["doc_count"] > 0
            ]

            out = {
                "daily":         daily,
                "total_7d":      total_7d,
                "trend":         trend,
                "trend_pct":     round(abs(change_pct)),
                "top_processes": top_processes,
            }
            cache.set(cache_key, out, ttl=120)
            return out

        except Exception as e:
            logger.warning(f"get_rule_trend({rule_id}) failed: {e}")
            return {"daily": [], "total_7d": 0, "trend": "flat", "trend_pct": 0, "top_processes": []}

    # ── Grouped alerts ───────────────────────────────────────────────────────

    async def get_grouped_alerts(
        self,
        severity: str = None,
        agent: str = None,
        rule_id: str = None,
        hours_back: float = 24,
    ) -> dict:
        cache_key = f"wazuh_grouped_{severity}_{agent}_{rule_id}_{hours_back}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        must = [{"range": {"timestamp": {"gte": f"now-{int(hours_back * 60)}m"}}}]
        if severity and severity in LEVEL_RANGES:
            must.append({"range": {"rule.level": LEVEL_RANGES[severity]}})
        if agent:
            must.append({"match": {"agent.name": agent}})
        if rule_id:
            must.append({"term": {"rule.id": rule_id}})

        result = await self.indexer.search({
            "size": 0,
            "query": {"bool": {"must": must}},
            "aggs": {
                "by_rule": {
                    "terms": {
                        "field": "rule.id",
                        "size": 500,
                        "order": {"_count": "desc"},
                    },
                    "aggs": {
                        "by_agent": {
                            "terms": {
                                "field": "agent.name",
                                "size": 50,
                            },
                            "aggs": {
                                "latest": {
                                    "top_hits": {
                                        "size": 1,
                                        "sort": [{"timestamp": {"order": "desc"}}],
                                        "_source": [
                                            "timestamp", "id",
                                            "agent.*", "manager.*", "decoder.*",
                                            "input.*", "location",
                                            "rule.*", "data.*",
                                            "syscheck.*",
                                        ],
                                    }
                                },
                                "last_seen": {"max": {"field": "timestamp"}},
                                "first_seen": {"min": {"field": "timestamp"}},
                            }
                        }
                    }
                }
            },
        })

        groups = []
        for rule_bucket in result["aggregations"]["by_rule"]["buckets"]:
            for agent_bucket in rule_bucket["by_agent"]["buckets"]:
                count = agent_bucket["doc_count"]
                last_seen = agent_bucket["last_seen"].get("value_as_string")
                first_seen = agent_bucket["first_seen"].get("value_as_string")

                hits = agent_bucket["latest"]["hits"]["hits"]
                if not hits:
                    continue

                src = hits[0]["_source"]
                src["id"] = src.get("id") or hits[0]["_id"]

                groups.append({
                    "count": count,
                    "last_seen": last_seen or src.get("timestamp"),
                    "first_seen": first_seen,
                    "alert": src,
                })

        # Sort by count descending so noisiest groups appear first
        groups.sort(key=lambda g: g["count"], reverse=True)

        out = {
            "total_groups": len(groups),
            "total_alerts": sum(g["count"] for g in groups),
            "groups": groups,
        }
        cache.set(cache_key, out, ttl=60)
        return out

    # ── Agents (manager API) ──────────────────────────────────────────────────

    async def get_agents(self) -> list:
        cached = cache.get("wazuh_agents")
        if cached:
            return cached
        data = await self._mgr_get("/agents", {"limit": 500})
        agents = data.get("data", {}).get("affected_items", [])
        cache.set("wazuh_agents", agents, ttl=120)
        return agents
