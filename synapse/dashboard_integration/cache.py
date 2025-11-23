"""Cache helpers for Dashboard integration (placeholder).

Future work: wrap Redis with TTL, provide batched lookups.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class InMemoryCache:
    """Simple in-memory cache placeholder.

    This exists to align with the project structure and will be evolved to a
    Redis-backed implementation.
    """

    def __init__(self) -> None:
        self._data: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        return self._data.get(key)

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value

    def delete(self, key: str) -> None:
        self._data.pop(key, None)

