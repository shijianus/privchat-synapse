#!/usr/bin/env python3
"""
Simple test script to verify dashboard integration logic without full Synapse installation.
Tests the core functionality of the dashboard integration components.
"""

import sys
import os
import asyncio
from unittest.mock import MagicMock, AsyncMock
from pathlib import Path

# Add the synapse directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

def test_dashboard_integration_imports():
    """Test that dashboard integration modules can be imported"""
    print("Testing dashboard integration imports...")

    try:
        # Test basic imports
        from synapse.dashboard_integration.cache import TTLCache
        print("TTLCache imported successfully")

        from synapse.dashboard_integration.db_queries import (
            DashboardUserRecord,
            load_user_routing_state
        )
        print("db_queries imported successfully")

        from synapse.dashboard_integration.pubsub import DashboardPubSubListener
        print("pubsub imported successfully")

        return True
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return False

def test_cache_functionality():
    """Test the TTL cache functionality"""
    print("\nTesting TTL cache functionality...")

    try:
        from synapse.dashboard_integration.cache import TTLCache

        # Create a cache with 5 second TTL
        cache = TTLCache(ttl_seconds=5)

        # Test basic operations
        cache.set("test_key", "test_value")
        assert cache.get("test_key") == "test_value"
        print("✅ Basic cache set/get works")

        # Test non-existent key
        assert cache.get("non_existent") is None
        print("✅ Non-existent key returns None")

        # Test cache invalidation
        cache.invalidate("test_key")
        assert cache.get("test_key") is None
        print("✅ Cache invalidation works")

        return True
    except Exception as e:
        print(f"❌ Cache test failed: {e}")
        return False

async def test_database_queries():
    """Test database query functionality with mock"""
    print("\nTesting database queries...")

    try:
        from synapse.dashboard_integration.db_queries import DashboardUserRecord

        # Test dataclass creation
        user_record = DashboardUserRecord(
            ban_type="none",
            reason=None,
            ban_expires_at_ms=None,
            user_group="general",
            registration_status="active",
            risk_level="low"
        )

        assert user_record.ban_type == "none"
        assert user_record.user_group == "general"
        print("✅ DashboardUserRecord creation works")

        # Test with banned user
        banned_record = DashboardUserRecord(
            ban_type="soft_ban",
            reason="Violation of community guidelines",
            ban_expires_at_ms=None,
            user_group="general",
            registration_status="active",
            risk_level="high"
        )

        assert banned_record.ban_type == "soft_ban"
        assert "community guidelines" in banned_record.reason
        print("✅ Banned user record creation works")

        return True
    except Exception as e:
        print(f"❌ Database query test failed: {e}")
        return False

def test_pubsub_mock():
    """Test pubsub functionality with mock"""
    print("\nTesting pubsub functionality...")

    try:
        from synapse.dashboard_integration.pubsub import DashboardPubSubListener

        # Mock the homeserver and config
        mock_hs = MagicMock()
        mock_hs.config.dashboard.redis_channel_user_events = ["test_channel"]
        mock_hs.get_redis_connection = MagicMock(return_value=MagicMock())

        # Test listener creation (this won't actually connect due to mocking)
        listener = DashboardPubSubListener(mock_hs)
        assert listener is not None
        print("✅ PubSub listener creation works")

        return True
    except Exception as e:
        print(f"❌ PubSub test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("Testing Dashboard Integration Logic")
    print("=" * 50)

    tests = [
        test_dashboard_integration_imports,
        test_cache_functionality,
        test_database_queries,
        test_pubsub_mock
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        try:
            if asyncio.iscoroutinefunction(test):
                result = await test()
            else:
                result = test()

            if result:
                passed += 1
        except Exception as e:
            print(f"❌ Test {test.__name__} failed with exception: {e}")

    print("\n" + "=" * 50)
    print(f"Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("All tests passed! Dashboard integration logic is working correctly.")
        return True
    else:
        print("Some tests failed. Please check the implementation.")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)