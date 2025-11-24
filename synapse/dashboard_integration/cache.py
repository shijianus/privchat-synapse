"""Dashboard 缓存工具，提供带 TTL 的本地缓存。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from synapse.util.clock import Clock


@dataclass
class CacheEntry:
    """缓存条目，记录值及到期时间"""

    value: Any
    expires_at_ms: Optional[int]


class TTLCache:
    """带 TTL 的简易缓存，后续可平滑切换到 Redis"""

    # DASHBOARD INTEGRATION

    def __init__(self, clock: Clock, default_ttl_ms: int) -> None:
        self._clock = clock
        self._default_ttl_ms = max(0, default_ttl_ms)
        self._data: Dict[str, CacheEntry] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._data.get(key)
        if entry is None:
            return None
        if entry.expires_at_ms is not None and entry.expires_at_ms <= self._clock.time_msec():
            self._data.pop(key, None)
            return None
        return entry.value

    def set(self, key: str, value: Any, ttl_ms: Optional[int] = None) -> None:
        ttl = self._default_ttl_ms if ttl_ms is None else max(0, ttl_ms)
        expires_at = None
        if ttl > 0:
            expires_at = self._clock.time_msec() + ttl
        self._data[key] = CacheEntry(value=value, expires_at_ms=expires_at)

    def delete(self, key: str) -> None:
        self._data.pop(key, None)

    def clear(self) -> None:
        self._data.clear()
