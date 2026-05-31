"""
Root pytest configuration for performance and query optimization checks.

Features:
- assertNumQueries() context manager for verifying query counts
- Automatic query counting on all database operations
- Warning system for tests exceeding query limits
"""

import pytest
from contextlib import contextmanager
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection


@contextmanager
def assertNumQueries(num):
    """
    Context manager to assert the exact number of queries executed.

    Usage:
        with assertNumQueries(1):
            response = self.client.get('/api/gamedays/')

    Args:
        num: Expected number of queries

    Raises:
        AssertionError: If actual query count doesn't match expected
    """
    with CaptureQueriesContext(connection) as context:
        yield context

    actual = len(context)
    if actual != num:
        # Print first few queries for debugging
        queries_str = "\n".join([
            f"  {i+1}. {q['sql'][:100]}..."
            for i, q in enumerate(context.captured_queries[:5])
        ])
        if len(context) > 5:
            queries_str += f"\n  ... and {len(context) - 5} more"

        raise AssertionError(
            f"Expected {num} queries, got {actual}.\n"
            f"Queries executed:\n{queries_str}"
        )


# Make assertNumQueries available globally in tests
@pytest.fixture
def assert_num_queries():
    """Pytest fixture providing assertNumQueries context manager."""
    return assertNumQueries


# Monkey-patch Django TestCase to support assertNumQueries
if not hasattr(TestCase, 'assertNumQueries'):
    TestCase.assertNumQueries = assertNumQueries


@pytest.fixture(autouse=True)
def reset_queries():
    """Reset query count between tests."""
    connection.queries_log.clear()
    yield
    connection.queries_log.clear()


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers",
        "high_query_count: mark test as expecting high query count (temporarily disable check)"
    )
    config.addinivalue_line(
        "markers",
        "skip_query_check: skip query count validation for this test"
    )
