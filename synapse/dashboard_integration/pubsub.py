"""Redis Pub/Sub placeholder for Dashboard integration.

Future work: subscribe to invalidation channels and drop local caches.
"""

from __future__ import annotations

from typing import Callable


class NoopSubscriber:
    """No-op pub/sub subscriber placeholder."""

    def subscribe(self, _channel: str, _handler: Callable[[str], None]) -> None:
        return

