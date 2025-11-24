"""
Configuration for Dashboard integration.

Disabled by default; when enabled, provides hooks for login and event
enforcement based on external management policy.
"""

from __future__ import annotations

from typing import Any

from synapse.config._base import Config, ConfigError
from synapse.types import JsonDict


class DashboardConfig(Config):
    section = "dashboard"

    def read_config(self, config: JsonDict, **kwargs: Any) -> None:
        # Whether the integration is enabled. Defaults to False for safety.
        self.enabled: bool = bool(config.get("dashboard", {}).get("enabled", False))

        # Reserved/placeholder options for future expansion. We read them
        # defensively but do not enforce anything yet in this initial scaffold.
        dash = config.get("dashboard") or {}
        if not isinstance(dash, dict):
            raise ConfigError("`dashboard` must be a mapping", ("dashboard",))

        # Optional: TTLs or Redis channel names can be added here later.
        # DASHBOARD INTEGRATION: 订阅频道支持单值或列表
        channels = dash.get("redis_channel_user_events")
        if channels is None:
            self.redis_channel_user_events: list[str] = []
        elif isinstance(channels, str):
            self.redis_channel_user_events = [channels]
        elif isinstance(channels, list) and all(isinstance(item, str) for item in channels):
            self.redis_channel_user_events = channels
        else:
            raise ConfigError(
                "`dashboard.redis_channel_user_events` must be a string or list of strings",
                ("dashboard", "redis_channel_user_events"),
            )
        self.default_cache_ttl_seconds: int = int(dash.get("default_cache_ttl_seconds", 300))
