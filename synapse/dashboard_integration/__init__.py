"""
Dashboard integration module for Synapse.

This provides a minimal, disabled-by-default hook point to enforce
management decisions made by an external Dashboard, without impacting
core Synapse behavior when not enabled.

All code paths which touch Synapse internals are guarded behind the
`dashboard.enabled` config flag and degrade safely to no-ops.

Note: This is an initial scaffold per project RULES. It intentionally
implements a conservative policy surface and a simple in-memory cache;
storage/Redis/pubsub wiring can be built on top without changing call
sites.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from synapse.server import HomeServer


@dataclass(frozen=True)
class UserRoutingState:
    """Represents the enforcement state for a user.

    Attributes:
        ban_type: One of "none", "silence", "soft_ban", "hard_ban".
        reason: Optional human-readable reason for enforcement.
    """

    ban_type: str = "none"
    reason: Optional[str] = None


class DashboardIntegration:
    """Dashboard 集成模块，负责风控检查和缓存管理

    This object is cached on the `HomeServer` and is queried by login and
    event creation flows to decide whether a user action is allowed.
    """

    # DASHBOARD INTEGRATION

    def __init__(self, hs: HomeServer) -> None:
        self._hs = hs
        self._config = hs.config.dashboard

        # Simple in-memory cache keyed by Matrix user ID.
        # Future: back with Redis + TTL; wire pub/sub to invalidate.
        self._routing_cache: Dict[str, UserRoutingState] = {}

    def is_enabled(self) -> bool:
        """Return True if the Dashboard integration is enabled via config."""

        return bool(getattr(self._config, "enabled", False))

    def get_user_routing_state(self, user_id: str) -> UserRoutingState:
        """Get the current routing/enforcement state for the user.

        The initial scaffold uses an in-memory cache only. If no state is
        known, we return the default (no enforcement).

        Args:
            user_id: Matrix user id (e.g. "@alice:example.org").

        Returns:
            A UserRoutingState describing the current enforcement level.
        """

        # DASHBOARD INTEGRATION: 优先从缓存读取
        state = self._routing_cache.get(user_id)
        if state is not None:
            return state

        # Placeholder: future DB/Redis lookup goes here.
        return UserRoutingState()

    def set_user_routing_state(self, user_id: str, state: UserRoutingState) -> None:
        """Update the local cache for a given user.

        This is primarily for future pub/sub invalidation or administrative
        overrides during development/testing.
        """

        self._routing_cache[user_id] = state

    # -- Policy helpers ---------------------------------------------------

    def check_login_allowed(self, user_id: str) -> Tuple[bool, Optional[str]]:
        """Check whether the user is allowed to complete login.

        Args:
            user_id: Matrix user id

        Returns:
            tuple of (is_allowed, reason)
        """

        if not self.is_enabled():
            return True, None

        state = self.get_user_routing_state(user_id)
        if state.ban_type in {"soft_ban", "hard_ban"}:
            reason = state.reason or "This account is restricted by server policy."
            return False, reason
        return True, None

    def check_event_allowed(self, user_id: str, event_type: str, content: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Check whether the user is allowed to create/send an event.

        Policy (initial scaffold):
        - hard_ban / soft_ban: block all events
        - silence: block non-membership, non-redaction events (allow leave and self-redact)

        Args:
            user_id: Matrix user id
            event_type: event type (e.g. "m.room.message")
            content: event content dict

        Returns:
            tuple of (is_allowed, reason)
        """

        if not self.is_enabled():
            return True, None

        state = self.get_user_routing_state(user_id)
        ban = state.ban_type
        if ban in {"soft_ban", "hard_ban"}:
            reason = state.reason or "User is banned by server policy."
            return False, reason

        if ban == "silence":
            # Allow membership changes and redactions while silenced.
            if event_type in {"m.room.member", "m.room.redaction"}:
                return True, None
            return False, "User is silenced and cannot send messages."

        return True, None


class NoopDashboardIntegration(DashboardIntegration):
    """A no-op implementation used when the feature is disabled."""

    def __init__(self, hs: HomeServer) -> None:  # type: ignore[override]
        self._hs = hs
        self._config = hs.config

    def is_enabled(self) -> bool:  # type: ignore[override]
        return False

    def get_user_routing_state(self, user_id: str) -> UserRoutingState:  # type: ignore[override]
        return UserRoutingState()

    def set_user_routing_state(self, user_id: str, state: UserRoutingState) -> None:  # type: ignore[override]
        return

    def check_login_allowed(self, user_id: str) -> Tuple[bool, Optional[str]]:  # type: ignore[override]
        return True, None

    def check_event_allowed(self, user_id: str, event_type: str, content: Dict[str, Any]) -> Tuple[bool, Optional[str]]:  # type: ignore[override]
        return True, None

