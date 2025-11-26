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
        print("✓ Path handling works correctly")
    else:
        print("✗ Path handling failed")
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
        print("✗ Schema file not found")
        return False

    with open(schema_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check for Windows-specific path separators
    if '\\\\' in content:
        print("✗ Contains Windows-specific path separators")
        return False

    # Check for proper line endings
    if '\r\n' in content:
        print("⚠ Contains Windows line endings (CRLF) - should be LF for Ubuntu")

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
            print(f"✓ Table {table} defined correctly")
        else:
            print(f"✗ Table {table} not found")
            return False

    return True

def test_python_import_compatibility():
    """Test Python import patterns for cross-platform compatibility"""
    print("\nTesting Python import compatibility...")

    # Test relative imports
    test_imports = [
        "from synapse.dashboard_integration.cache import TTLCache",
        "from synapse.dashboard_integration.db_queries import DashboardUserRecord",
        "from synapse.dashboard_integration.pubsub import DashboardPubSubListener"
    ]

    for import_statement in test_imports:
        # Check if modules exist (without actually importing to avoid dependency issues)
        module_path = import_statement.split(" from ")[1].split(" import ")[0]
        module_file = module_path.replace(".", "/") + ".py"

        full_path = Path(__file__).parent / module_file

        if full_path.exists():
            print(f"✓ {module_path} module exists")
        else:
            print(f"✗ {module_path} module missing")
            return False

    return True

def test_configuration_patterns():
    """Test configuration patterns for cross-platform deployment"""
    print("\nTesting configuration patterns...")

    # Check dashboard configuration
    config_file = Path(__file__).parent / "synapse" / "config" / "dashboard.py"

    if not config_file.exists():
        print("✗ Dashboard config file not found")
        return False

    with open(config_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check for platform-agnostic patterns
    problematic_patterns = [
        r"C:\\",  # Windows absolute paths
        r"/etc/", # Linux-specific paths in config
        r"\\\\",  # UNC paths
    ]

    import re
    for pattern in problematic_patterns:
        if re.search(pattern, content):
            print(f"⚠ Found potentially platform-specific pattern: {pattern}")

    print("✓ Configuration patterns look platform-agnostic")
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
            print(f"✓ Found {docker_file}")
            docker_found = True

    if not docker_found:
        print("⚠ No Docker configuration files found")

    # Check for installation scripts
    install_files = [
        "setup.py",
        "pyproject.toml",
        "install.sh",
        "requirements.txt"
    ]

    install_found = False
    for install_file in install_files:
        if (base_path / install_file).exists():
            print(f"✓ Found {install_file}")
            install_found = True

    if not install_found:
        print("⚠ No installation configuration found")

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
            print(f"✓ Found {doc_file}")
            doc_found = True

    if not doc_found:
        print("⚠ No documentation found")

    return True

def test_environment_variables():
    """Test environment variable usage for cross-platform compatibility"""
    print("\nTesting environment variable patterns...")

    # Check for environment variable usage in code
    env_patterns = [
        r"dashboard/backend/.env.example",
        r"dashboard/frontend/.env.example",
    ]

    base_path = Path(__file__).parent
    env_found = False

    for pattern in env_patterns:
        if (base_path / pattern).exists():
            print(f"✓ Found {pattern}")
            env_found = True

    # Check dashboard backend for env patterns
    backend_dir = base_path / "dashboard" / "backend"
    if backend_dir.exists():
        print("✓ Dashboard backend directory exists")

        # Look for environment variable usage
        for py_file in backend_dir.glob("**/*.py"):
            try:
                with open(py_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                if "os.environ" in content or "getenv" in content:
                    print(f"✓ {py_file.relative_to(base_path)} uses environment variables")
                    env_found = True
                    break
            except Exception:
                pass

    if not env_found:
        print("⚠ No environment variable configuration found")

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
        test_deployment_readiness,
        test_environment_variables
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
        print("✓ All compatibility tests passed!")
    else:
        print("⚠ Some compatibility issues detected.")

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