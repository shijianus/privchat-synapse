"""Dashboard Redis Pub/Sub 桥接模块"""

# DASHBOARD INTEGRATION

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Awaitable, Callable, Sequence, Tuple, cast

from synapse.logging.context import PreserveLoggingContext, make_deferred_yieldable
from synapse.metrics.background_process_metrics import (
    BackgroundProcessLoggingContext,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from twisted.internet.interfaces import IAddress

    from synapse.server import HomeServer

try:
    from txredisapi import SubscriberProtocol
except Exception as exc:  # pragma: no cover - optional dependency
    SubscriberProtocol = None  # type: ignore[assignment]
    _TXREDIS_IMPORT_ERROR = exc
else:
    _TXREDIS_IMPORT_ERROR = None

try:
    from synapse.replication.tcp.context import ClientContextFactory
    from synapse.replication.tcp.redis import SynapseRedisFactory
except Exception as exc:  # pragma: no cover - optional dependency
    SynapseRedisFactory = None  # type: ignore[assignment]
    ClientContextFactory = None  # type: ignore[assignment]
    _REDIS_FACTORY_IMPORT_ERROR = exc
else:
    _REDIS_FACTORY_IMPORT_ERROR = None

MessageHandler = Callable[[str, str], Awaitable[None]]


class DashboardPubSubListener:
    """Dashboard Redis 订阅监听器，负责缓存失效通知"""

    # DASHBOARD INTEGRATION

    def __init__(
        self,
        hs: "HomeServer",
        channels: Sequence[str],
        handler: MessageHandler,
    ) -> None:
        self._hs = hs
        self._channels = tuple(dict.fromkeys(channels))
        self._handler = handler
        self._factory: "_DashboardRedisSubscriberFactory | None" = None
        self._started = False

        if not self._channels:
            logger.debug(
                "# DASHBOARD INTEGRATION: pub/sub disabled, no channels configured"
            )
            return

        if not self._dependencies_available:
            logger.warning(
                "# DASHBOARD INTEGRATION: Redis pub/sub requires txredisapi; %s",
                self._dependency_error_details,
            )
            return

        try:
            self._connect()
        except Exception:  # pragma: no cover - twisted networking
            logger.exception(
                "# DASHBOARD INTEGRATION: failed to bootstrap dashboard pub/sub"
            )

    @property
    def _dependencies_available(self) -> bool:
        return (
            SubscriberProtocol is not None
            and SynapseRedisFactory is not None
            and ClientContextFactory is not None
        )

    @property
    def _dependency_error_details(self) -> str:
        if _TXREDIS_IMPORT_ERROR:
            return f"txredisapi import failed: {_TXREDIS_IMPORT_ERROR}"
        if _REDIS_FACTORY_IMPORT_ERROR:
            return f"redis factory import failed: {_REDIS_FACTORY_IMPORT_ERROR}"
        return "missing optional Redis dependencies"

    def _connect(self) -> None:
        if not self._hs.config.redis.redis_enabled:
            logger.warning(
                "# DASHBOARD INTEGRATION: redis_channel_user_events set but Redis disabled"
            )
            return

        assert SynapseRedisFactory is not None

        self._factory = _DashboardRedisSubscriberFactory(
            hs=self._hs,
            channels=self._channels,
            handler=self._handler,
        )
        self._started = True

        reactor = self._hs.get_reactor()

        redis_conf = self._hs.config.redis
        if redis_conf.redis_path is None:
            if redis_conf.redis_use_tls:
                assert ClientContextFactory is not None
                context = ClientContextFactory(redis_conf)
                reactor.connectSSL(
                    redis_conf.redis_host,
                    redis_conf.redis_port,
                    self._factory,
                    context,
                    timeout=30,
                    bindAddress=None,
                )
            else:
                reactor.connectTCP(
                    redis_conf.redis_host,
                    redis_conf.redis_port,
                    self._factory,
                    timeout=30,
                    bindAddress=None,
                )
        else:
            reactor.connectUNIX(
                redis_conf.redis_path,
                self._factory,
                timeout=30,
                checkPID=False,
            )


if SubscriberProtocol is not None and SynapseRedisFactory is not None:
    class _DashboardRedisSubscriber(SubscriberProtocol):
        """轻量级订阅协议，用于转发 Dashboard 事件"""

        def __init__(self, *args: object, **kwargs: object) -> None:
            super().__init__(*args, **kwargs)
            self._hs: "HomeServer | None" = None
            self._channels: Tuple[str, ...] = ()
            self._handler: MessageHandler | None = None
            self._logging_context: BackgroundProcessLoggingContext | None = None

        def configure(
            self,
            hs: "HomeServer",
            channels: Sequence[str],
            handler: MessageHandler,
        ) -> None:
            self._hs = hs
            self._channels = tuple(dict.fromkeys(channels))
            self._handler = handler

        def _get_logging_context(self) -> BackgroundProcessLoggingContext:
            if self._logging_context is None:
                assert self._hs is not None
                self._logging_context = BackgroundProcessLoggingContext(
                    name="dashboard_pubsub", server_name=self._hs.hostname
                )
            return self._logging_context

        def connectionMade(self) -> None:
            logger.info("# DASHBOARD INTEGRATION: Redis pub/sub connected")
            super().connectionMade()
            if self._hs is None:
                return

            async def _subscribe() -> None:
                if not self._channels:
                    return
                await make_deferred_yieldable(self.subscribe(list(self._channels)))

            self._hs.run_as_background_process(
                "dashboard-pubsub-subscribe", _subscribe
            )

        def messageReceived(self, pattern: str, channel: str, message: str) -> None:
            if self._hs is None or self._handler is None:
                return

            channel_str = _ensure_text(channel)
            payload = _ensure_text(message)

            async def _dispatch() -> None:
                try:
                    await self._handler(channel_str, payload)
                except Exception:  # pragma: no cover - defensive logging
                    logger.exception(
                        "# DASHBOARD INTEGRATION: failed processing Redis message"
                    )

            with PreserveLoggingContext(self._get_logging_context()):
                self._hs.run_as_background_process(
                    "dashboard-pubsub-dispatch", _dispatch
                )


    class _DashboardRedisSubscriberFactory(SynapseRedisFactory):
        """构建 `_DashboardRedisSubscriber` 实例的工厂"""

        protocol = _DashboardRedisSubscriber
        maxDelay = 5

        def __init__(
            self,
            hs: "HomeServer",
            channels: Sequence[str],
            handler: MessageHandler,
        ) -> None:
            super().__init__(
                hs,
                uuid="dashboard-pubsub",
                dbid=hs.config.redis.redis_dbid,
                poolsize=1,
                replyTimeout=30,
                password=hs.config.redis.redis_password,
            )
            self._hs = hs
            self._channels = tuple(channels)
            self._handler = handler

        def buildProtocol(self, addr: "IAddress") -> "_DashboardRedisSubscriber":
            proto = super().buildProtocol(addr)
            proto = cast(_DashboardRedisSubscriber, proto)
            proto.configure(self._hs, self._channels, self._handler)
            return proto


def _ensure_text(value: str) -> str:
    """把 Redis 消息统一转换成 UTF-8 字符串"""

    if isinstance(value, bytes):  # type: ignore[unreachable]
        return value.decode("utf-8", errors="ignore")
    return str(value)
