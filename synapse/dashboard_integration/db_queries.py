"""Dashboard 集成数据库查询，负责读取风控状态"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from synapse.server import HomeServer
from synapse.storage.database import LoggingTransaction

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DashboardUserRecord:
    """用户风控记录"""

    synapse_user_id: str
    user_group: str
    registration_status: str
    risk_level: str
    ban_type: Optional[str]
    ban_reason: Optional[str]
    ban_expires_at_ms: Optional[int]


_PROFILE_SQL = """
    SELECT id, synapse_user_id, user_group, registration_status, risk_level
    FROM dashboard.user_profiles
    WHERE synapse_user_id = ?
    LIMIT 1
"""

_BANS_SQL = """
    SELECT ban_type, reason, expires_at, created_at
    FROM dashboard.user_bans
    WHERE user_id = ?
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
"""

_BAN_PRIORITY = {
    "hard_ban": 3,
    "soft_ban": 2,
    "silence": 1,
    "none": 0,
}

_SCHEMA_ERROR_LOGGED = False


async def load_user_routing_state(hs: HomeServer, user_id: str) -> Optional[DashboardUserRecord]:
    """读取用户的最新风控状态，若数据缺失返回 None"""

    database = hs.get_datastores().main.db_pool

    def _load_state(txn: LoggingTransaction) -> Optional[DashboardUserRecord]:
        txn.execute(_PROFILE_SQL, (user_id,))
        row = txn.fetchone()
        if row is None:
            return None

        profile_id = row[0]
        synapse_user_id = row[1]
        user_group = row[2]
        registration_status = row[3]
        risk_level = row[4]

        txn.execute(_BANS_SQL, (profile_id,))
        bans = list(txn.fetchall())
        ban_type: Optional[str] = None
        ban_reason: Optional[str] = None
        ban_expires_at: Optional[int] = None

        best_priority = -1
        best_created_at = -1
        for current_type, current_reason, expires_at, created_at in bans:
            priority = _BAN_PRIORITY.get(current_type, 0)
            created_at_ms = _coerce_timestamp(created_at)
            if priority > best_priority or (
                priority == best_priority and created_at_ms > best_created_at
            ):
                best_priority = priority
                best_created_at = created_at_ms
                ban_type = current_type
                ban_reason = current_reason
                ban_expires_at = _coerce_timestamp(expires_at)

        return DashboardUserRecord(
            synapse_user_id=synapse_user_id,
            user_group=user_group,
            registration_status=registration_status,
            risk_level=risk_level,
            ban_type=ban_type,
            ban_reason=ban_reason,
            ban_expires_at_ms=ban_expires_at,
        )

    try:
        return await database.runInteraction("dashboard_load_user_state", _load_state)
    except Exception as exc:  # pragma: no cover - defensive
        _log_schema_warning(exc)
        return None


def _coerce_timestamp(value: object) -> Optional[int]:
    """把 datetime/数值转换成毫秒时间戳"""

    if value is None:
        return None
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if isinstance(value, (int, float)):
        if value > 1e12:
            return int(value)
        return int(value * 1000)
    return None


def _log_schema_warning(exc: Exception) -> None:
    """只记录一次 schema 缺失/错误，避免刷屏"""

    global _SCHEMA_ERROR_LOGGED
    if _SCHEMA_ERROR_LOGGED:
        return
    _SCHEMA_ERROR_LOGGED = True
    logger.warning(
        "# DASHBOARD INTEGRATION: dashboard schema unavailable, disable enforcement: %s",
        exc,
    )
