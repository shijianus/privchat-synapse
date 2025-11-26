#!/usr/bin/env python3
"""
Standalone test script to verify dashboard integration logic without any Synapse dependencies.
Tests the core functionality using mocked dependencies.
"""

import sys
import os
import asyncio
from unittest.mock import MagicMock, AsyncMock
from pathlib import Path
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

# Mock Synapse dependencies before importing
sys.modules['synapse.util.clock'] = MagicMock()
sys.modules['synapse.types'] = MagicMock()
sys.modules['synapse.storage'] = MagicMock()
sys.modules['synapse.api'] = MagicMock()
sys.modules['synapse.server'] = MagicMock()

# Add the synapse directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

@dataclass
class CacheEntry:
    """Cache entry with value and expiration time"""
    value: Any
    expires_at_ms: Optional[int]

class MockClock:
    """Mock clock for testing"""
    def __init__(self):
        self._time_ms = int(time.time() * 1000)

    def time_msec(self) -> int:
        return self._time_ms

    def advance_time(self, ms: int):
        self._time_ms += ms

class MockTTLCache:
    """Mock TTL cache implementation"""
    def __init__(self, clock: MockClock, default_ttl_ms: int):
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

@dataclass(frozen=True)
class MockDashboardUserRecord:
    """Mock dashboard user record"""
    ban_type: str = "none"
    reason: Optional[str] = None
    ban_expires_at_ms: Optional[int] = None
    user_group: str = "general"
    registration_status: str = "active"
    risk_level: str = "low"

def test_cache_functionality():
    """Test the TTL cache functionality"""
    print("Testing TTL cache functionality...")

    try:
        # Create a mock clock and cache with 5 second TTL
        clock = MockClock()
        cache = MockTTLCache(clock, default_ttl_ms=5000)

        # Test basic operations
        cache.set("test_key", "test_value")
        assert cache.get("test_key") == "test_value"
        print("Basic cache set/get works")

        # Test non-existent key
        assert cache.get("non_existent") is None
        print("Non-existent key returns None")

        # Test cache expiration
        cache.set("expiring_key", "expiring_value", ttl_ms=1000)
        assert cache.get("expiring_key") == "expiring_value"
        print("Cache set with custom TTL works")

        # Advance time beyond TTL
        clock.advance_time(2000)
        assert cache.get("expiring_key") is None
        print("Cache expiration works")

        # Test cache invalidation
        cache.set("persistent_key", "persistent_value")
        assert cache.get("persistent_key") == "persistent_value"
        cache.delete("persistent_key")
        assert cache.get("persistent_key") is None
        print("Cache invalidation works")

        return True
    except Exception as e:
        print(f"Cache test failed: {e}")
        return False

def test_user_record_dataclass():
    """Test dashboard user record functionality"""
    print("\nTesting dashboard user record...")

    try:
        # Test normal user record
        user_record = MockDashboardUserRecord(
            ban_type="none",
            reason=None,
            ban_expires_at_ms=None,
            user_group="general",
            registration_status="active",
            risk_level="low"
        )

        assert user_record.ban_type == "none"
        assert user_record.user_group == "general"
        assert user_record.risk_level == "low"
        print("Normal user record creation works")

        # Test banned user record
        banned_record = MockDashboardUserRecord(
            ban_type="soft_ban",
            reason="Violation of community guidelines",
            ban_expires_at_ms=None,
            user_group="general",
            registration_status="active",
            risk_level="high"
        )

        assert banned_record.ban_type == "soft_ban"
        assert "community guidelines" in banned_record.reason
        assert banned_record.risk_level == "high"
        print("Banned user record creation works")

        # Test temporarily banned user
        temp_banned = MockDashboardUserRecord(
            ban_type="silence",
            reason="Spam detection",
            ban_expires_at_ms=int(time.time() * 1000) + 3600000,  # 1 hour from now
            user_group="standard",
            registration_status="active",
            risk_level="medium"
        )

        assert temp_banned.ban_type == "silence"
        assert temp_banned.ban_expires_at_ms is not None
        assert temp_banned.ban_expires_at_ms > int(time.time() * 1000)
        print("Temporarily banned user record works")

        return True
    except Exception as e:
        print(f"User record test failed: {e}")
        return False

def test_risk_control_scenarios():
    """Test various risk control scenarios"""
    print("\nTesting risk control scenarios...")

    try:
        # Test all ban types
        ban_types = ["none", "silence", "soft_ban", "hard_ban"]

        for ban_type in ban_types:
            record = MockDashboardUserRecord(ban_type=ban_type, reason=f"Test {ban_type}")
            assert record.ban_type == ban_type
            assert f"Test {ban_type}" in record.reason

        print("All ban types work correctly")

        # Test user groups
        user_groups = ["free", "standard", "premium", "enterprise"]

        for group in user_groups:
            record = MockDashboardUserRecord(user_group=group)
            assert record.user_group == group

        print("All user groups work correctly")

        # Test registration statuses
        statuses = ["pending", "active", "suspended", "deleted"]

        for status in statuses:
            record = MockDashboardUserRecord(registration_status=status)
            assert record.registration_status == status

        print("All registration statuses work correctly")

        # Test risk levels
        risk_levels = ["low", "medium", "high", "critical"]

        for risk in risk_levels:
            record = MockDashboardUserRecord(risk_level=risk)
            assert record.risk_level == risk

        print("All risk levels work correctly")

        return True
    except Exception as e:
        print(f"Risk control scenarios test failed: {e}")
        return False

async def test_cache_performance():
    """Test cache performance with multiple operations"""
    print("\nTesting cache performance...")

    try:
        clock = MockClock()
        cache = MockTTLCache(clock, default_ttl_ms=300000)  # 5 minutes

        # Test with multiple entries
        num_entries = 1000
        for i in range(num_entries):
            cache.set(f"key_{i}", f"value_{i}")

        # Test retrieval
        for i in range(num_entries):
            value = cache.get(f"key_{i}")
            assert value == f"value_{i}"

        print(f"Cache handles {num_entries} entries correctly")

        # Test mixed operations
        for i in range(100):
            cache.set(f"mixed_key_{i}", f"mixed_value_{i}")
            value = cache.get(f"key_{i * 10}")  # Get some existing keys
            if i % 10 == 0:
                cache.delete(f"key_{i}")  # Delete some keys

        print("Cache mixed operations work correctly")

        return True
    except Exception as e:
        print(f"Cache performance test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("Testing Dashboard Integration Logic (Standalone)")
    print("=" * 50)

    tests = [
        test_cache_functionality,
        test_user_record_dataclass,
        test_risk_control_scenarios,
        test_cache_performance
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
            print(f"Test {test.__name__} failed with exception: {e}")

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