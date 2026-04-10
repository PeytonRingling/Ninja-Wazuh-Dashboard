import time
from typing import Any, Optional

_cache: dict[str, tuple[Any, float]] = {}
TTL = 60  # seconds


def get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.monotonic() > expires_at:
        del _cache[key]
        return None
    return value


def set(key: str, value: Any, ttl: int = TTL) -> None:
    _cache[key] = (value, time.monotonic() + ttl)


def invalidate(key: str) -> None:
    _cache.pop(key, None)


def clear() -> None:
    _cache.clear()
