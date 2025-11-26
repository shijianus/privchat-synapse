#!/usr/bin/env python3
"""
Test script to validate the dashboard database schema SQL file.
"""

import re
import sys
from pathlib import Path

def test_sql_syntax():
    """Test basic SQL syntax validation"""
    print("Testing SQL syntax validation...")

    try:
        schema_file = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"

        if not schema_file.exists():
            print("Schema file not found")
            return False

        with open(schema_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check for basic SQL structure
        required_patterns = [
            r'CREATE SCHEMA IF NOT EXISTS dashboard',
            r'CREATE TABLE IF NOT EXISTS dashboard\.user_profiles',
            r'CREATE TABLE IF NOT EXISTS dashboard\.user_bans',
            r'CREATE TABLE IF NOT EXISTS dashboard\.user_appeals',
            r'CREATE TABLE IF NOT EXISTS dashboard\.appeal_messages',
            r'CREATE TABLE IF NOT EXISTS dashboard\.operation_logs',
            r'CREATE TABLE IF NOT EXISTS dashboard\.media_metadata',
            r'CREATE TABLE IF NOT EXISTS dashboard\.storage_policies',
            r'CREATE TABLE IF NOT EXISTS dashboard\.media_sync_tasks',
            r'CREATE TABLE IF NOT EXISTS dashboard\.registration_applications',
            r'CREATE TABLE IF NOT EXISTS dashboard\.admin_users'
        ]

        for pattern in required_patterns:
            if not re.search(pattern, content, re.IGNORECASE):
                print(f"Missing pattern: {pattern}")
                return False

        print("All required table schemas found")
        return True

    except Exception as e:
        print(f"SQL syntax test failed: {e}")
        return False

def test_table_definitions():
    """Test table definition completeness"""
    print("\nTesting table definitions...")

    try:
        schema_file = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"

        with open(schema_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Test user_profiles table
        if not re.search(r'user_profiles.*synapse_user_id.*TEXT NOT NULL UNIQUE', content, re.DOTALL | re.IGNORECASE):
            print("user_profiles table missing synapse_user_id field")
            return False

        # Test user_bans table
        if not re.search(r'user_bans.*ban_type.*CHECK.*silence.*soft_ban.*hard_ban', content, re.DOTALL | re.IGNORECASE):
            print("user_bans table missing proper ban_type constraints")
            return False

        # Test user_appeals table
        if not re.search(r'user_appeals.*status.*CHECK.*pending.*accepted.*rejected', content, re.DOTALL | re.IGNORECASE):
            print("user_appeals table missing proper status constraints")
            return False

        # Test indexes
        index_patterns = [
            r'CREATE INDEX.*user_bans_user_idx',
            r'CREATE INDEX.*user_bans_status_idx',
            r'CREATE INDEX.*user_appeals_user_idx',
            r'CREATE INDEX.*operation_logs_target_idx'
        ]

        for pattern in index_patterns:
            if not re.search(pattern, content, re.IGNORECASE):
                print(f"Missing index: {pattern}")
                return False

        print("All table definitions are complete")
        return True

    except Exception as e:
        print(f"Table definition test failed: {e}")
        return False

def test_data_constraints():
    """Test data constraints and check conditions"""
    print("\nTesting data constraints...")

    try:
        schema_file = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"

        with open(schema_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Test foreign key constraints
        fk_patterns = [
            r'REFERENCES dashboard\.user_profiles\(id\)',
            r'REFERENCES dashboard\.user_bans\(id\)',
            r'REFERENCES dashboard\.user_appeals\(id\)'
        ]

        for pattern in fk_patterns:
            if not re.search(pattern, content, re.IGNORECASE):
                print(f"Missing foreign key: {pattern}")
                return False

        # Test check constraints
        check_patterns = [
            r'ban_type.*CHECK.*ban_type IN \(.*none.*silence.*soft_ban.*hard_ban.*\)',
            r'status.*CHECK.*status IN \(.*pending.*accepted.*rejected.*\)',
            r'risk_level.*CHECK.*risk_level IN \(.*low.*medium.*high.*critical.*\)'
        ]

        for pattern in check_patterns:
            if not re.search(pattern, content, re.IGNORECASE):
                print(f"Missing check constraint: {pattern}")
                return False

        print("All data constraints are properly defined")
        return True

    except Exception as e:
        print(f"Data constraints test failed: {e}")
        return False

def test_admin_bootstrap():
    """Test admin user bootstrap data"""
    print("\nTesting admin bootstrap...")

    try:
        schema_file = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"

        with open(schema_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check for admin user bootstrap
        if not re.search(r'INSERT INTO dashboard\.admin_users', content, re.IGNORECASE):
            print("Missing admin user bootstrap")
            return False

        # Check for super admin role
        if not re.search(r'super_admin', content, re.IGNORECASE):
            print("Missing super admin role")
            return False

        print("Admin bootstrap data found")
        return True

    except Exception as e:
        print(f"Admin bootstrap test failed: {e}")
        return False

def test_schema_completeness():
    """Test overall schema completeness"""
    print("\nTesting schema completeness...")

    try:
        schema_file = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"

        with open(schema_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Remove comments and empty lines
        content_lines = [line.strip() for line in lines if line.strip() and not line.strip().startswith('--')]

        # Should have a reasonable number of actual SQL statements
        if len(content_lines) < 50:
            print("Schema appears too short")
            return False

        # Check for at least 10 tables
        table_count = len(re.findall(r'CREATE TABLE IF NOT EXISTS dashboard\.', content := '\n'.join(content_lines), re.IGNORECASE))
        if table_count < 10:
            print(f"Expected at least 10 tables, found {table_count}")
            return False

        print(f"Schema completeness verified: {table_count} tables found")
        return True

    except Exception as e:
        print(f"Schema completeness test failed: {e}")
        return False

def main():
    """Main test function"""
    print("Testing Dashboard Database Schema")
    print("=" * 50)

    tests = [
        test_sql_syntax,
        test_table_definitions,
        test_data_constraints,
        test_admin_bootstrap,
        test_schema_completeness
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        try:
            result = test()
            if result:
                passed += 1
        except Exception as e:
            print(f"Test {test.__name__} failed with exception: {e}")

    print("\n" + "=" * 50)
    print(f"Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("All database schema tests passed!")
        return True
    else:
        print("Some database schema tests failed.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)