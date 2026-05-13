# URL Resolution Test Design
**Date:** 2026-05-13  
**Purpose:** Verify that all registered URL patterns and named URLs in the Django application actually resolve and point to valid views.

---

## Problem Statement

As the codebase grows with multiple Django apps and URL includes, it's easy to introduce broken URL patterns:
- Views that are renamed or removed but URL patterns aren't updated
- Template errors that only surface when the URL is accessed
- Import errors in views that aren't caught until runtime
- Missing or misconfigured includes

This test suite will catch these issues early by:
1. Discovering all registered URL patterns across the entire application
2. Testing each one with actual HTTP requests
3. Failing fast on the first broken URL

---

## Scope

- **In scope:** All URL patterns defined in `league_manager/urls.py` and all included app URLs
- **In scope:** Both explicit named URLs and all URL patterns (named or unnamed)
- **In scope:** Public and authentication-required URLs
- **Out of scope:** Dynamic URL generation, third-party libraries (debug toolbar, admin discovery)
- **Out of scope:** Testing actual business logic or response content (just that URLs resolve)

---

## Solution Overview

The solution has two components:

### 1. Utility Function in `conftest.py`

**Function:** `collect_all_url_patterns()`  
**Location:** `league_manager/tests/conftest.py`  
**Purpose:** Recursively traverse the Django URL configuration and extract all testable patterns.

**Inputs:**
- Root URLconf (defaults to Django settings.ROOT_URLCONF)

**Outputs:**
- List of tuples: `(pattern_string, pattern_name, is_include)`
- `pattern_string`: The URL path to test (with placeholder values for path converters)
- `pattern_name`: The name of the pattern (if named), or None
- `is_include`: Boolean indicating if this is an include() pattern

**Behavior:**
- Recursively walks `urlpatterns`
- For `path()` patterns: extracts literal paths
- For `re_path()` patterns: converts regex to testable strings (or marks as untestable)
- For `include()` patterns: resolves the included URLconf and prefixes patterns with the include path
- For patterns with converters (`:int`, `:slug`, etc.): uses placeholder values (`1` for int, `test-slug` for slug)
- Handles nested includes
- Skips debug toolbar and other conditional includes

### 2. Test in `league_manager/tests/test_url_resolution.py`

**Test:** `test_all_urls_resolve(client, django_user_model)`  
**Purpose:** Verify each discovered URL pattern actually responds.

**Setup:**
- Create a test user with standard permissions
- Authenticate the client with this user
- Collect all URL patterns using the utility

**Execution:**
For each URL pattern:
1. Make a GET request to the URL
2. Check the response status code
3. Fail fast if:
   - 5xx error (server error - indicates view/template error)
   - ImportError or AttributeError (view doesn't exist)
   - URLResolver error (pattern is malformed)
4. Accept 2xx, 3xx, 4xx responses (URL resolved successfully, even if returning error status)

**Error Reporting:**
When a URL fails, report:
- The URL pattern that failed
- The HTTP status code or exception
- The traceback (if available)
- Stop immediately (fail fast, don't test remaining URLs)

---

## Implementation Details

### Pattern Collection Algorithm

```
function collect_all_url_patterns(urlconf, prefix=""):
  patterns = []
  
  for pattern in urlconf.urlpatterns:
    if pattern is include():
      # Recursively get patterns from included URLconf
      included_patterns = collect_all_url_patterns(
        get_included_urlconf(pattern),
        prefix + pattern.prefix
      )
      patterns.extend(included_patterns)
    
    elif pattern is path() or re_path():
      pattern_string = prefix + pattern.pattern
      # Replace path converters with placeholders
      pattern_string = replace_converters(pattern_string)
      
      patterns.append({
        'url': pattern_string,
        'name': pattern.name,
        'view': pattern.callback
      })
  
  return patterns
```

### Path Converter Replacements

When testing patterns with converters, use safe placeholder values:

| Converter | Placeholder |
|-----------|-------------|
| `int` | `1` |
| `slug` | `test-slug` |
| `uuid` | `550e8400-e29b-41d4-a716-446655440000` |
| `str` | `test` |
| `path` | `test/path` |

### Testing Strategy

1. **Authentication:** Create a test user to avoid 403 errors on protected views
2. **HTTP Method:** Use GET requests (safest, no side effects)
3. **Status Codes:**
   - ✅ 2xx (200-299): Success - URL resolved
   - ✅ 3xx (300-399): Redirect - URL resolved, redirecting (acceptable)
   - ✅ 4xx (400-499): Client error - URL resolved, view working (e.g., 404 if intentional)
   - ❌ 5xx (500-599): Server error - indicates bug in view or template
   - ❌ Import/Attribute errors - view doesn't exist
   - ❌ URLResolver errors - pattern is malformed

### Error Handling

When a URL fails:
1. Immediately stop testing (fail fast)
2. Report:
   - URL pattern that failed
   - HTTP status code (if available)
   - Exception type and message
   - Traceback
3. Exit with clear message: `"URL resolution test failed: /api/example/ returned 500"`

---

## Excluded Patterns

The following are intentionally excluded from testing:

- **Debug toolbar URLs** (`__debug__/`) - Only in DEBUG mode
- **Admin discovery views** - May require specific permissions
- **Static/media URLs** - Served by web server, not Django views
- **Third-party auth redirects** - External URLs

These are skipped during pattern collection.

---

## Testing the Test

The URL resolution test itself should be tested by:

1. **Happy path:** Run against current URL config, verify it passes
2. **Broken URL detection:** Temporarily add a broken URL pattern and verify the test catches it
3. **View removal:** Remove a view and verify the test fails
4. **Pattern syntax:** Add a malformed pattern and verify the test fails

---

## Success Criteria

✅ Test discovers all URL patterns in the application  
✅ Test makes actual HTTP requests to verify patterns resolve  
✅ Test uses authenticated client to handle protected URLs  
✅ Test fails fast on first broken URL  
✅ Test reports clear error message showing which URL failed  
✅ Test integrates with existing pytest/Django test setup  
✅ Utility is reusable for other test scenarios  

---

## Dependencies

- Django test client
- pytest (already in use)
- No external libraries needed

---

## Future Enhancements

- Collect and report ALL broken URLs instead of failing fast (if needed)
- Test other HTTP methods (POST, PUT, DELETE) for API endpoints
- Generate coverage report showing % of URLs tested
- Export test results to CI/CD reporting
