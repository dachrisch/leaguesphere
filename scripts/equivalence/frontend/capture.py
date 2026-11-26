"""Per-step capture and normalisation for frontend equivalence (Phase 3, #2539).

The frontend harness reuses the Phase 0c normalisers and diff records rather
than copying them: a step is a normalised, ordered list of API requests
(method, path, body *shape* only) plus normalised visible text and an ARIA
snapshot. Nothing in a captured step carries a value that could be a name,
email, token or id from the shared stage database.

Stdlib + Playwright (the browser objects are passed in by the runner), so the
pure functions here can be characterized with the backend branch gate.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

# Reuse the Phase 0c rules by import (PROVISIONAL P3): one redaction policy for
# both halves of the harness.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import normalise  # noqa: E402
from diff import Diff, diff_json  # noqa: E402

# Volatile ARIA/DOM lines excluded from a journey diff. This allowlist is
# documented and reviewed at the first ref-vs-ref noise floor; it is never
# widened silently. Each entry is (pattern, reason).
VOLATILE_NODES = (
    (r"^vor \d+\s*(?:s|sek|min|h)\b$", "relative clock label"),
    (r"^gerade eben$", "relative clock label"),
    (r"\[(?:focused|active)\]", "focus state of the last clicked control"),
    (r"\b(?:fade|slide|transition)-(?:in|out)\b", "CSS transition state"),
)


def body_shape(value):
    """Return the key/type structure of ``value``, never its values."""
    if isinstance(value, dict):
        return {key: body_shape(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return [body_shape(item) for item in value[:1]]
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if value is None:
        return "null"
    return "other"


def request_shape(body):
    """Body shape of a raw request body; unparseable bodies are not failed."""
    if not body:
        return "empty"
    try:
        value = json.loads(body)
    except (TypeError, ValueError):
        return "unparsed"
    return body_shape(value)


def normalise_path(url, tokens=None):
    """Normalise a request path: sorted query, redacted noise and id tokens."""
    # Redact the whole URL first so query values are scrubbed too; sorting the
    # raw query afterwards keeps placeholders literal (urlencode would escape
    # the angle brackets used by the redactor).
    cleaned = normalise.normalise_html(url, tokens or {})
    parts = urlsplit(cleaned)
    query = "&".join(sorted(part for part in parts.query.split("&") if part))
    return f"{parts.path}?{query}" if query else parts.path


def normalise_request(request, tokens=None):
    """Return ``{method, path, body_shape}`` for one recorded API request."""
    return {
        "method": request.get("method", "GET").upper(),
        "path": normalise_path(request.get("url", ""), tokens),
        "body_shape": request_shape(request.get("body")),
    }


def normalise_dom(text, tokens=None, volatile=None):
    """Normalise visible text / an ARIA snapshot and drop volatile nodes.

    ``volatile`` defaults to the documented allowlist; pass ``()`` to disable
    it (used by the tests that prove the allowlist itself is the only filter).
    """
    patterns = VOLATILE_NODES if volatile is None else volatile
    cleaned = normalise.normalise_html(text, tokens or {})
    kept = []
    for line in cleaned.splitlines():
        if any(re.search(pattern, line) for pattern, _ in patterns):
            continue
        kept.append(line)
    return "\n".join(kept)


class StepCapture:
    """Collect only API requests during one journey step."""

    def __init__(self, tokens=None):
        self.tokens = tokens or {}
        self.requests = []

    def record(self, request):
        """Record an internal API request; the SSE stream is excluded."""
        path = urlsplit(request.get("url", "")).path
        if path.startswith("/api/") and "/stream/" not in path:
            self.requests.append(normalise_request(request, self.tokens))

    def as_list(self):
        return list(self.requests)


def capture_step(page, capture=None, tokens=None):
    """Capture network + visible DOM/ARIA for the current page state."""
    collector = capture or StepCapture(tokens)
    text = page.evaluate("() => document.body.innerText || ''")
    aria = page.locator("body").aria_snapshot()
    return {
        "requests": collector.as_list(),
        "dom": normalise_dom(text, tokens),
        "aria": normalise_dom(aria, tokens),
    }


def compare_steps(left, right, journey):
    """Diff two step maps; keys are ``<journey>:<step>``, values never carry data."""
    diffs = {}
    for step in sorted(set(left) | set(right)):
        key = f"{journey}:{step}"
        if step not in left:
            diffs[key] = [Diff("$", "extra")]
        elif step not in right:
            diffs[key] = [Diff("$", "missing")]
        else:
            found = diff_json(left[step], right[step])
            if found:
                diffs[key] = found
    return diffs
