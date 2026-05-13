import re
from typing import List, Dict, Any, Optional
from django.urls import URLPattern, URLResolver, get_resolver
from django.urls.resolvers import RoutePattern, RegexPattern


# Placeholder values for path converters
CONVERTER_PLACEHOLDERS = {
    'int': '1',
    'slug': 'test-slug',
    'uuid': '550e8400-e29b-41d4-a716-446655440000',
    'str': 'test',
    'path': 'test/path',
}


def _replace_path_converters(pattern_str: str) -> str:
    """
    Replace path converters in a pattern with placeholder values.

    Converts patterns like '<int:id>' to '1', '<slug:name>' to 'test-slug', etc.
    """
    for converter_type, placeholder in CONVERTER_PLACEHOLDERS.items():
        pattern_str = re.sub(rf'<{converter_type}:\w+>', placeholder, pattern_str)
    return pattern_str


def _should_skip_pattern(pattern_name: Optional[str], pattern_url: str) -> bool:
    """Check if a pattern should be skipped from testing."""
    # Skip debug toolbar
    if '__debug__' in pattern_url:
        return True
    # Skip static/media URLs
    if pattern_url.startswith('static/') or pattern_url.startswith('media/'):
        return True
    # Skip error simulation views (intentionally return 5xx)
    if 'database-error' in pattern_url:
        return True
    return False


def collect_all_url_patterns(
    resolver: Optional[URLResolver] = None,
    prefix: str = ''
) -> List[Dict[str, Any]]:
    """
    Recursively collect all URL patterns from Django's URL configuration.

    Returns a list of dictionaries with keys:
    - 'url': The full URL path to test (with placeholders for converters)
    - 'name': The pattern name (if named), or None
    - 'view': The view callable or None for includes
    - 'is_include': Boolean indicating if this is an include pattern
    """
    if resolver is None:
        resolver = get_resolver()

    patterns = []

    for pattern in resolver.url_patterns:
        # Extract the pattern string
        if isinstance(pattern, URLResolver):
            # This is an include() pattern
            pattern_str = str(pattern.pattern)
            # Remove angle brackets and convert regex if needed
            if isinstance(pattern.pattern, RegexPattern):
                pattern_str = pattern.pattern.regex.pattern.rstrip('$')
            else:
                # RoutePattern from path()
                pattern_str = pattern.pattern._route

            full_pattern = prefix + pattern_str
            full_pattern = _replace_path_converters(full_pattern)

            pattern_name = getattr(pattern, 'name', None) or getattr(pattern, 'namespace', None)
            if not _should_skip_pattern(pattern_name, full_pattern):
                # Recursively collect from included URLconf
                included_patterns = collect_all_url_patterns(pattern, full_pattern)
                patterns.extend(included_patterns)

        else:
            # This is a regular URLPattern (path() or re_path())
            pattern_str = str(pattern.pattern)

            if isinstance(pattern.pattern, RegexPattern):
                # re_path() - extract the regex pattern
                pattern_str = pattern.pattern.regex.pattern.rstrip('$')
                # Try to simplify common regex patterns
                pattern_str = pattern_str.replace(r'(?P<id>\d+)', '1')
                pattern_str = pattern_str.replace(r'(?P<pk>\d+)', '1')
            else:
                # path() - extract the route
                pattern_str = pattern.pattern._route

            full_pattern = prefix + pattern_str
            full_pattern = _replace_path_converters(full_pattern)

            pattern_name = getattr(pattern, 'name', None) or getattr(pattern, 'namespace', None)
            if not _should_skip_pattern(pattern_name, full_pattern):
                patterns.append({
                    'url': '/' + full_pattern if not full_pattern.startswith('/') else full_pattern,
                    'name': pattern.name,
                    'view': pattern.callback,
                    'is_include': False,
                })

    return patterns
