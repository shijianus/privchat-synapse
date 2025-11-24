#
# This file is licensed under the Affero General Public License (AGPL) version 3.
#
# Copyright 2025 The Matrix.org Foundation C.I.C.
# Copyright (C) 2025 New Vector, Ltd
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# See the GNU Affero General Public License for more details:
# <https://www.gnu.org/licenses/agpl-3.0.html>.
#
# Originally licensed under the Apache License, Version 2.0:
# <http://www.apache.org/licenses/LICENSE-2.0>.
#
# [This file includes modifications made by New Vector Limited]
#

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from synapse.dashboard_integration import DashboardIntegration

from tests.unittest import TestCase


class _DummyClock:
    def time_msec(self) -> int:
        return 0


class _DummyAuthHandler:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    async def delete_access_tokens_for_user(self, user_id: str) -> None:
        self.deleted.append(user_id)


class _DummyHomeServer:
    def __init__(self) -> None:
        self._clock = _DummyClock()
        self._auth = _DummyAuthHandler()
        self.config = SimpleNamespace(
            dashboard=SimpleNamespace(
                enabled=True,
                default_cache_ttl_seconds=1,
                redis_channel_user_events=[],
            ),
            redis=SimpleNamespace(redis_enabled=False),
        )

    def get_clock(self) -> _DummyClock:
        return self._clock

    def get_auth_handler(self) -> _DummyAuthHandler:
        return self._auth


class DashboardIntegrationPubSubTest(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.hs = _DummyHomeServer()
        self.integration = DashboardIntegration(self.hs)  # type: ignore[arg-type]

    def test_decode_plain_string_payload(self) -> None:
        event = DashboardIntegration._decode_pubsub_payload(
            "dashboard.user.invalidate",
            "@alice:example.com",
        )
        assert event is not None
        self.assertEqual(event.user_ids, ("@alice:example.com",))
        self.assertFalse(event.force_disconnect)

    def test_decode_json_payload_with_disconnect(self) -> None:
        payload = (
            '{"action":"dashboard.user.force_disconnect","user_ids":'
            '["@alice:example.com","@bob:example.com"],"force_disconnect":true}'
        )
        event = DashboardIntegration._decode_pubsub_payload(
            "dashboard.user.force_disconnect",
            payload,
        )
        assert event is not None
        self.assertEqual(event.user_ids, ("@alice:example.com", "@bob:example.com"))
        self.assertTrue(event.force_disconnect)

    def test_handle_pubsub_triggers_invalidation_and_disconnect(self) -> None:
        payload = '{"user_ids": ["@alice:example.com"], "force_disconnect": true}'
        self.integration.invalidate_user = MagicMock()
        self.integration._force_disconnect = AsyncMock()  # type: ignore[attr-defined]

        self.get_success(
            self.integration._handle_pubsub_message(
                "dashboard.user.force_disconnect",
                payload,
            )
        )

        self.integration.invalidate_user.assert_called_once_with("@alice:example.com")
        self.integration._force_disconnect.assert_awaited_once_with(  # type: ignore[attr-defined]
            "@alice:example.com"
        )

    def test_force_disconnect_invokes_auth_handler(self) -> None:
        self.get_success(self.integration._force_disconnect("@alice:example.com"))
        self.assertEqual(self.hs.get_auth_handler().deleted, ["@alice:example.com"])
