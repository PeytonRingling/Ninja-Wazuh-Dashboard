import logging
from urllib.parse import quote
from typing import Any
import httpx

logger = logging.getLogger(__name__)

INDEX = "wazuh-alerts-4.x-*"


class IndexerClient:
    """Queries Wazuh Indexer (OpenSearch) via the Dashboard console proxy at port 443."""

    def __init__(self, dashboard_url: str, username: str, password: str):
        self.dashboard_url = dashboard_url.rstrip("/")
        self.auth = (username, password)

    async def search(self, body: dict) -> dict:
        path = quote(f"{INDEX}/_search", safe="*-.")
        url = f"{self.dashboard_url}/api/console/proxy?path={path}&method=POST"
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            resp = await client.post(
                url,
                json=body,
                auth=self.auth,
                headers={"osd-xsrf": "true"},
            )
            resp.raise_for_status()
            return resp.json()
