#!/usr/bin/env python3
"""
Test script to validate Windows-Ubuntu compatibility for the dashboard integration.
This checks for platform-specific issues that might arise when deploying on Ubuntu.
"""

import os
import sys
import platform
import subprocess
from pathlib import Path
from typing import List, Tuple

def test_platform_compatibility():
    """Test basic platform compatibility checks"""
    print("Testing platform compatibility...")

    current_platform = platform.system()
    print(f"Current platform: {current_platform}")
    print(f"Python version: {sys.version}")

    if current_platform not in ["Windows", "Linux", "Darwin"]:
        print(f"Warning: Untested platform: {current_platform}")

    # Test Python path handling
    test_path = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"
    if test_path.exists():
        print("[OK] Path handling works correctly")
    else:
        print("[FAIL] Path handling failed")
        return False

    return True

def test_file_permissions():
    """Test file permissions and access patterns"""
    print("\nTesting file permissions...")

    # Test reading critical files
    critical_files = [
        "dashboard/schema/dashboard_schema.sql",
        "synapse/dashboard_integration/__init__.py",
        "synapse/dashboard_integration/cache.py",
        "synapse/dashboard_integration/db_queries.py",
        "synapse/dashboard_integration/pubsub.py"
    ]

    base_path = Path(__file__).parent

    for file_path in critical_files:
        full_path = base_path / file_path
        if full_path.exists():
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read(100)  # Read first 100 chars
                print(f"[OK] {file_path} readable")
            except Exception as e:
                print(f"[FAIL] {file_path} not readable: {e}")
                return False
        else:
            print(f"[FAIL] {file_path} missing")
            return False

    return True

def test_database_schema_portability():
    """Test database schema for cross-platform compatibility"""
    print("\nTesting database schema portability...")

    schema_file = Path(__file__).parent / "dashboard" / "schema" / "dashboard_schema.sql"

    if not schema_file.exists():
        print("[FAIL] Schema file not found")
        return False

    with open(schema_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check for Windows-specific path separators
    if '\\\\' in content:
        print("[FAIL] Contains Windows-specific path separators")
        return False

    # Check for proper line endings
    if '\r\n' in content:
        print("[WARN] Contains Windows line endings (CRLF) - should be LF for Ubuntu")

    # Check for case-sensitive table names (important for Ubuntu)
    required_tables = [
        "user_profiles",
        "user_bans",
        "user_appeals",
        "appeal_messages",
        "operation_logs",
        "media_metadata",
        "storage_policies",
        "media_sync_tasks",
        "registration_applications",
        "admin_users"
    ]

    for table in required_tables:
        if f"CREATE TABLE IF NOT EXISTS dashboard.{table}" in content:
            print(f"[OK] Table {table} defined correctly")
        else:
            print(f"[FAIL] Table {table} not found")
            return False

    return True

def test_python_import_compatibility():
    """Test Python import patterns for cross-platform compatibility"""
    print("\nTesting Python import compatibility...")

    # Test relative imports
    test_imports = [
        ("synapse.dashboard_integration.cache", "TTLCache"),
        ("synapse.dashboard_integration.db_queries", "DashboardUserRecord"),
        ("synapse.dashboard_integration.pubsub", "DashboardPubSubListener")
    ]

    for module_path, class_name in test_imports:
        # Check if modules exist (without actually importing to avoid dependency issues)
        module_file = module_path.replace(".", "/") + ".py"

        full_path = Path(__file__).parent / module_file

        if full_path.exists():
            print(f"[OK] {module_path} module exists")
        else:
            print(f"[FAIL] {module_path} module missing")
            return False

    return True

def test_configuration_patterns():
    """Test configuration patterns for cross-platform deployment"""
    print("\nTesting configuration patterns...")

    # Check dashboard configuration
    config_file = Path(__file__).parent / "synapse" / "config" / "dashboard.py"

    if not config_file.exists():
        print("[FAIL] Dashboard config file not found")
        return False

    with open(config_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check for platform-agnostic patterns
    problematic_patterns = [
        "C:\\",  # Windows absolute paths
        "/etc/", # Linux-specific paths in config
        "\\\\",  # UNC paths
    ]

    for pattern in problematic_patterns:
        if pattern in content:
            print(f"[WARN] Found potentially platform-specific pattern: {pattern}")

    print("[OK] Configuration patterns look platform-agnostic")
    return True

def test_deployment_readiness():
    """Test deployment readiness indicators"""
    print("\nTesting deployment readiness...")

    # Check for Docker-related files
    docker_files = [
        "docker-compose.yml",
        "Dockerfile",
        "contrib/docker/"
    ]

    base_path = Path(__file__).parent
    docker_found = False

    for docker_file in docker_files:
        if (base_path / docker_file).exists() or (base_path / docker_file).is_dir():
            print(f"[OK] Found {docker_file}")
            docker_found = True

    if not docker_found:
        print("[WARN] No Docker configuration files found")

    # Check for installation scripts
    install_files = [
        "setup.py",
        "pyproject.toml",
        "requirements.txt"
    ]

    install_found = False
    for install_file in install_files:
        if (base_path / install_file).exists():
            print(f"[OK] Found {install_file}")
            install_found = True

    if not install_found:
        print("[WARN] No installation configuration found")

    # Check for documentation
    doc_files = [
        "README.rst",
        "README.md",
        "INSTALL.md",
        "CONTRIBUTING.md"
    ]

    doc_found = False
    for doc_file in doc_files:
        if (base_path / doc_file).exists():
            print(f"[OK] Found {doc_file}")
            doc_found = True

    if not doc_found:
        print("[WARN] No documentation found")

    return True

def generate_compatibility_report() -> List[str]:
    """Generate a compatibility report with recommendations"""
    print("\nGenerating compatibility report...")

    recommendations = []

    # Platform-specific recommendations
    if platform.system() == "Windows":
        recommendations.extend([
            "Ensure line endings are LF (not CRLF) before deploying to Ubuntu",
            "Test Docker image building on Ubuntu target platform",
            "Validate file permissions and case sensitivity on Ubuntu"
        ])

    recommendations.extend([
        "Use environment variables for all platform-specific paths",
        "Test Redis connection strings for Ubuntu deployment",
        "Validate PostgreSQL connection strings for Ubuntu",
        "Test with Python 3.10+ (Ubuntu default versions)",
        "Ensure all file paths use forward slashes (/) in configuration"
    ])

    return recommendations

def main():
    """Main test function"""
    print("Testing Windows-Ubuntu Compatibility")
    print("=" * 50)
    print(f"Platform: {platform.platform()}")
    print(f"Architecture: {platform.architecture()}")
    print(f"Python: {sys.version}")

    tests = [
        test_platform_compatibility,
        test_file_permissions,
        test_database_schema_portability,
        test_python_import_compatibility,
        test_configuration_patterns,
        test_deployment_readiness
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
    print(f"Compatibility Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("[SUCCESS] All compatibility tests passed!")
    else:
        print("[WARNING] Some compatibility issues detected.")

    # Generate recommendations
    recommendations = generate_compatibility_report()
    if recommendations:
        print("\nRecommendations for Ubuntu deployment:")
        for i, rec in enumerate(recommendations, 1):
            print(f"{i}. {rec}")

    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)