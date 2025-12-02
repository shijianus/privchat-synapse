"""Dashboard 管理集成，负责登录/消息风控检查"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence, Tuple, TYPE_CHECKING

from synapse.dashboard_integration.cache import TTLCache
from synapse.dashboard_integration.db_queries import (
    DashboardUserRecord,
    load_user_routing_state,
)
from synapse.dashboard_integration.pubsub import DashboardPubSubListener
from synapse.util.json import json_decoder

if TYPE_CHECKING:
    from synapse.server import HomeServer

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class UserRoutingState:
    """Dashboard 风控状态对象"""

    ban_type: str = "none"
    reason: Optional[str] = None
    ban_expires_at_ms: Optional[int] = None
    user_group: str = "general"
    registration_status: str = "active"
    risk_level: str = "low"


@dataclass(frozen=True)
class PubSubEvent:
    """Dashboard Redis 事件承载结构"""

    action: str
    user_ids: Tuple[str, ...]
    force_disconnect: bool = False


class DashboardIntegration:
    """Dashboard 集成模块，负责风控检查和缓存管理"""

    # DASHBOARD INTEGRATION

    def __init__(self, hs: "HomeServer") -> None:
        self._hs = hs
        self._config = hs.config.dashboard

        # DASHBOARD INTEGRATION: TTL 缓存，默认 5 分钟
        ttl_seconds = getattr(self._config, "default_cache_ttl_seconds", 300)
        self._routing_cache = TTLCache(hs.get_clock(), ttl_seconds * 1000)
        self._pubsub_listener: Optional[DashboardPubSubListener] = None
        self._setup_pubsub_listener()

    def is_enabled(self) -> bool:
        """检查配置是否开启 Dashboard 集成功能"""

        return bool(getattr(self._config, "enabled", False))

    async def get_user_routing_state(self, user_id: str) -> UserRoutingState:
        """获取指定用户的风控状态，包含缓存命中与数据库补全"""

        cached_state = self._routing_cache.get(user_id)
        if cached_state is not None:
            return cached_state

        record = await load_user_routing_state(self._hs, user_id)
        if record is None:
            logger.debug("# DASHBOARD INTEGRATION: no dashboard state for %s", user_id)
            state = UserRoutingState()
        else:
            state = self._record_to_state(record)

        self._routing_cache.set(user_id, state)
        return state

    def set_user_routing_state(self, user_id: str, state: UserRoutingState) -> None:
        """手动写入缓存，供后台强制刷新"""

        self._routing_cache.set(user_id, state)

    def invalidate_user(self, user_id: str) -> None:
        """手动删除缓存，配合 pub/sub 使用"""

        self._routing_cache.delete(user_id)

    def _setup_pubsub_listener(self) -> None:
        """按需初始化 Redis 订阅监听"""

        channels: Sequence[str] = getattr(self._config, "redis_channel_user_events", [])
        if not channels:
            return
        if not self._hs.config.redis.redis_enabled:
            logger.warning(
                "# DASHBOARD INTEGRATION: redis_channel_user_events configured but Redis disabled"
            )
            return
        try:
            self._pubsub_listener = DashboardPubSubListener(
                hs=self._hs,
                channels=channels,
                handler=self._handle_pubsub_message,
            )
        except Exception:  # pragma: no cover - defensive logging
            logger.exception(
                "# DASHBOARD INTEGRATION: failed to start Redis pub/sub listener"
            )

    # -- Policy helpers ---------------------------------------------------

    async def check_login_allowed(self, user_id: str) -> Tuple[bool, Optional[str]]:
        """检查登录权限，返回 (是否允许, 拒绝原因)"""

        if not self.is_enabled():
            return True, None

        state = await self.get_user_routing_state(user_id)

        if state.registration_status not in {"active", "approved"}:
            reason = state.reason or "Account pending manual approval."
            return False, reason

        if state.ban_type in {"soft_ban", "hard_ban"}:
            reason = state.reason or "This account is restricted by server policy."
            return False, reason
        return True, None

    async def check_event_allowed(
        self, user_id: str, event_type: str, content: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        """检查事件权限，返回 (是否允许, 拒绝原因)"""

        if not self.is_enabled():
            return True, None

        state = await self.get_user_routing_state(user_id)
        ban = state.ban_type
        if ban in {"soft_ban", "hard_ban"}:
            reason = state.reason or "User is banned by server policy."
            return False, reason

        if ban == "silence":
            # DASHBOARD INTEGRATION: 静言仅允许退群/自撤回
            if event_type in {"m.room.member", "m.room.redaction"}:
                return True, None
            return False, "User is silenced and cannot send messages."

        return True, None

    def _record_to_state(self, record: DashboardUserRecord) -> UserRoutingState:
        """把数据库记录转成统一状态对象"""

        reason = record.ban_reason
        if record.ban_type in {"soft_ban", "hard_ban", "silence"} and reason is None:
            reason = "This account is restricted by server policy."

        return UserRoutingState(
            ban_type=record.ban_type or "none",
            reason=reason,
            ban_expires_at_ms=record.ban_expires_at_ms,
            user_group=record.user_group,
            registration_status=record.registration_status,
            risk_level=record.risk_level,
        )

    async def _handle_pubsub_message(self, channel: str, payload: str) -> None:
        """处理 Redis 推送消息并执行缓存刷新"""

        event = self._decode_pubsub_payload(channel, payload)
        if event is None:
            return

        for user_id in event.user_ids:
            self.invalidate_user(user_id)

        if event.force_disconnect:
            for user_id in event.user_ids:
                await self._force_disconnect(user_id)

    @staticmethod
    def _decode_pubsub_payload(channel: str, payload: str) -> Optional[PubSubEvent]:
        """把 Redis 字符串载荷解析成标准事件"""

        text = payload.strip()
        action = channel or "user.invalidate"

        def _make_event(
            users: Sequence[str], *, disconnect: bool = False
        ) -> Optional[PubSubEvent]:
            unique = tuple(dict.fromkeys(u for u in users if u))
            if not unique:
                return None
            return PubSubEvent(
                action=action,
                user_ids=unique,
                force_disconnect=disconnect or action.endswith("force_disconnect"),
            )

        if not text:
            return None

        try:
            parsed = json_decoder.decode(text)
        except Exception:
            return _make_event((text,))

        if isinstance(parsed, str):
            return _make_event((parsed,))

        if isinstance(parsed, list):
            values = [value.strip() for value in parsed if isinstance(value, str)]
            return _make_event(values)

        if isinstance(parsed, dict):
            action = str(parsed.get("action") or parsed.get("event") or action)
            disconnect = bool(parsed.get("force_disconnect"))

            user_values = None
            for key in ("user_ids", "users", "mxids"):
                if key in parsed:
                    user_values = parsed[key]
                    break
            if user_values is None and "user_id" in parsed:
                user_values = parsed["user_id"]

            users: Tuple[str, ...] = ()
            if isinstance(user_values, str):
                users = (user_values.strip(),)
            elif isinstance(user_values, list):
                users = tuple(v.strip() for v in user_values if isinstance(v, str))

            if not users:
                candidate = parsed.get("mxid") or parsed.get("target")
                if isinstance(candidate, str):
                    users = (candidate.strip(),)

            return _make_event(
                users,
                disconnect=disconnect or action.endswith("force_disconnect"),
            )

        return None

    async def _force_disconnect(self, user_id: str) -> None:
        """根据指令强制登出指定用户"""

        try:
            await self._hs.get_auth_handler().delete_access_tokens_for_user(user_id)
            logger.info(
                "# DASHBOARD INTEGRATION: forced logout for %s via pub/sub", user_id
            )
        except Exception:  # pragma: no cover - defensive logging
            logger.exception(
                "# DASHBOARD INTEGRATION: failed to disconnect %s", user_id
            )


class NoopDashboardIntegration(DashboardIntegration):
    """A no-op implementation used when the feature is disabled."""

    def __init__(self, hs: "HomeServer") -> None:  # type: ignore[override]
        self._hs = hs
        self._config = hs.config

    def is_enabled(self) -> bool:  # type: ignore[override]
        return False

    async def get_user_routing_state(self, user_id: str) -> UserRoutingState:  # type: ignore[override]
        return UserRoutingState()

    def set_user_routing_state(self, user_id: str, state: UserRoutingState) -> None:  # type: ignore[override]
        return

    async def check_login_allowed(self, user_id: str) -> Tuple[bool, Optional[str]]:  # type: ignore[override]
        return True, None

    async def check_event_allowed(  # type: ignore[override]
        self, user_id: str, event_type: str, content: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        return True, None


# Module alias for configuration compatibility
DashboardIntegrationModule = DashboardIntegration

__all__ = ["DashboardIntegration", "DashboardIntegrationModule", "NoopDashboardIntegration"]
