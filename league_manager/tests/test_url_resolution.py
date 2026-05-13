import pytest
from django.test import Client
from django.contrib.auth import get_user_model
from django.urls import get_resolver
from league_manager.tests.conftest import collect_all_url_patterns
from gamedays.tests.setup_factories.factories import TeamFactory, GamedayFactory
from passcheck.tests.setup_factories.factories_passcheck import PlayerlistFactory


User = get_user_model()


@pytest.fixture
def url_test_fixtures(db):
    """Create minimal objects with ID 1 for URL resolution test."""
    # Create Gameday with ID 1 for passcheck endpoints
    gameday = GamedayFactory(pk=1)
    # Create Team with ID 1
    team = TeamFactory(pk=1)
    # Create Playerlist with pk=1 for roster endpoint
    PlayerlistFactory(pk=1, team=team, gamedays=[gameday])
    return {"gameday": gameday, "team": team}


@pytest.fixture
def authenticated_client(db, django_user_model):
    """Create a test user and authenticated client."""
    user = django_user_model.objects.create_user(
        username='testuser',
        email='testuser@example.com',
        password='testpass123'
    )
    client = Client()
    client.force_login(user)
    return client


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


@pytest.mark.django_db
def test_all_registered_urls_resolve(authenticated_client, url_test_fixtures):
    """
    Test that all registered URL patterns actually resolve.

    This test collects all URL patterns from the Django configuration
    and makes GET requests to each one. It verifies that:
    - The URL pattern resolves (no 5xx errors)
    - Views exist and are callable
    - Templates (if used) exist and render

    Accepts 2xx, 3xx, 4xx responses (URL resolved successfully).
    Fails fast on 5xx errors or import/routing errors.
    """
    patterns = collect_all_url_patterns()

    if not patterns:
        pytest.skip("No URL patterns found")

    broken_urls = []

    for pattern in patterns:
        url = pattern['url']
        pattern_name = pattern['name']

        try:
            response = authenticated_client.get(url, follow=False)

            # 5xx errors indicate real problems
            if response.status_code >= 500:
                broken_urls.append({
                    'url': url,
                    'name': pattern_name,
                    'status': response.status_code,
                    'error': f"Server error: {response.status_code}"
                })
                # Fail fast on first error
                assert False, (
                    f"URL resolution failed: {url} (name: {pattern_name}) "
                    f"returned HTTP {response.status_code}"
                )

        except Exception as e:
            # Import errors, view errors, etc.
            broken_urls.append({
                'url': url,
                'name': pattern_name,
                'error': str(e)
            })
            assert False, (
                f"URL resolution failed: {url} (name: {pattern_name}) "
                f"raised {type(e).__name__}: {e}"
            )

    # If we got here, all URLs resolved successfully
    assert len(broken_urls) == 0, (
        f"Found {len(broken_urls)} broken URLs: {broken_urls}"
    )
