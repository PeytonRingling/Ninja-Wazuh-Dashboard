import time
import base64
import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


class WazuhAuth:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self._token: Optional[str] = None
        self._expires_at: float = 0

    async def get_token(self) -> str:
        # Refresh if within 60 seconds of expiry or not set
        if not self._token or time.monotonic() >= self._expires_at - 60:
            await self._authenticate()
        return self._token

    async def _authenticate(self) -> None:
        credentials = base64.b64encode(
            f"{self.username}:{self.password}".encode()
        ).decode()
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/security/user/authenticate",
                headers={"Authorization": f"Basic {credentials}"},
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["data"]["token"]
            # Wazuh tokens are valid for 900 seconds by default
            self._expires_at = time.monotonic() + 900
            logger.info("Wazuh token refreshed")

    async def headers(self) -> dict:
        token = await self.get_token()
        return {"Authorization": f"Bearer {token}"}


class NinjaAuth:
    def __init__(self, base_url: str, client_id: str, client_secret: str):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: Optional[str] = None
        self._expires_at: float = 0

    async def get_token(self) -> str:
        if not self._token or time.monotonic() >= self._expires_at - 60:
            await self._authenticate()
        return self._token

    async def _authenticate(self) -> None:
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "monitoring",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            self._expires_at = time.monotonic() + expires_in
            logger.info("NinjaOne token refreshed")

    async def headers(self) -> dict:
        token = await self.get_token()
        return {"Authorization": f"Bearer {token}"}
