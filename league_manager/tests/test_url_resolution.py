import pytest
from django.urls import get_resolver
from league_manager.tests.conftest import collect_all_url_patterns


def test_collect_all_url_patterns_returns_list():
    """Test that collect_all_url_patterns returns a list of patterns."""
    patterns = collect_all_url_patterns()
    assert isinstance(patterns, list)
    assert len(patterns) > 0


def test_collect_all_url_patterns_includes_named_urls():
    """Test that named URLs are collected."""
    patterns = collect_all_url_patterns()
    pattern_names = [p['name'] for p in patterns if p['name']]
    # Should have some named patterns
    assert len(pattern_names) > 0
    # Verify a known named URL is collected
    assert 'robots-txt' in pattern_names


def test_collect_all_url_patterns_includes_patterns():
    """Test that URL patterns are included."""
    patterns = collect_all_url_patterns()
    urls = [p['url'] for p in patterns]
    # Should have common patterns
    assert any('health' in url for url in urls)
    assert any('admin' in url for url in urls)
