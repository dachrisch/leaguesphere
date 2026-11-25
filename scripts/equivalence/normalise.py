"""Normalisers for the Phase 0c equivalence harness (dachrisch/leaguesphere#2536).

The harness diffs the same reads from a `ref` and a `cand` deployment that
share one database. Two responses can only be compared after the noise that
legitimately changes between two requests has been removed:

- CSRF tokens, session ids and other per-request secrets,
- timestamps (``updated_at``, ``Last-Modified`` values rendered into pages),
- asset fingerprints (``app-3f9a1c2e.js``, ``?v=<hash>``),
- ETags and cache keys,
- entity ids created by a write scenario (normalised to a stable token).

Everything else is left alone: a field that really differs must show up as
a diff. The noise floor self-test (``selftest.py``) proves the normaliser is
good enough before any report is trusted.

Stdlib only; the runner may run with a bare ``python3``.
"""

from __future__ import annotations

import re

TIMESTAMP_PLACEHOLDER = "<timestamp>"
SECRET_PLACEHOLDER = "<redacted>"
ASSET_PLACEHOLDER = "<asset>"

# Keys whose value is wall-clock noise. Matching is case-insensitive and
# also covers the ``*_at`` / ``*_timestamp`` shapes.
TIMESTAMP_KEYS = frozenset(
    {
        "created",
        "created_at",
        "created_on",
        "updated",
        "updated_at",
        "updated_on",
        "last_modified",
        "last_login",
        "last_seen",
        "published_at",
        "modified_at",
        "timestamp",
        "server_time",
        "now",
    }
)
TIMESTAMP_KEY_SUFFIXES = ("_at", "_on", "_timestamp", "_time")

# Keys whose value is a per-request secret or validator.
SECRET_KEYS = frozenset(
    {
        "csrf",
        "csrf_token",
        "csrfmiddlewaretoken",
        "token",
        "access_token",
        "refresh_token",
        "sessionid",
        "session_key",
        "etag",
        "nonce",
        "cache_key",
    }
)
SECRET_KEY_SUFFIXES = ("_token", "_hash", "_etag", "_nonce", "_key")

ISO_TIMESTAMP = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?"
)
ASSET_QUERY = re.compile(
    r"(?P<path>[\w./-]+\.(?:js|css|woff2?|png|jpe?g|gif|svg|ico))"
    r"\?v=[0-9A-Za-z._-]+"
)
ASSET_FINGERPRINT = re.compile(
    r"(?P<stem>[A-Za-z0-9_./-]+?)[.-](?P<hash>[0-9a-f]{8,})(?P<ext>\.(?:js|css|woff2?|png|jpe?g|gif|svg|ico))"
)
CSRF_INPUT = re.compile(
    r'(?P<prefix><input[^>]*name=["\']csrfmiddlewaretoken["\'][^>]*value=["\'])[^"\']*(?P<suffix>["\'])',
    re.IGNORECASE,
)
CSRF_JS = re.compile(
    r'(?P<prefix>csrfmiddlewaretoken["\']?\s*[:=]\s*["\'])[^"\']*(?P<suffix>["\'])'
)


def _is_timestamp_key(key):
    lowered = key.lower()
    return lowered in TIMESTAMP_KEYS or lowered.endswith(TIMESTAMP_KEY_SUFFIXES)


def _is_secret_key(key):
    lowered = key.lower()
    return lowered in SECRET_KEYS or lowered.endswith(SECRET_KEY_SUFFIXES)


def _scrub_string(value, id_tokens):
    value = ISO_TIMESTAMP.sub(TIMESTAMP_PLACEHOLDER, value)
    value = ASSET_QUERY.sub(
        lambda match: f"{match.group('path')}?v={ASSET_PLACEHOLDER}", value
    )
    value = ASSET_FINGERPRINT.sub(
        lambda match: f"{match.group('stem')}.{ASSET_PLACEHOLDER}{match.group('ext')}",
        value,
    )
    return _replace_tokens(value, id_tokens)


def _replace_tokens(value, tokens):
    if not tokens:
        return value
    for raw, token in sorted(tokens.items(), key=lambda item: -len(str(item[0]))):
        raw = str(raw)
        if raw.isdigit():
            value = re.sub(rf"(?<!\d){re.escape(raw)}(?!\d)", token, value)
        else:
            value = value.replace(raw, token)
    return value


def normalise_json(value, id_tokens=None):
    """Return a deep copy of ``value`` with per-request noise removed.

    ``id_tokens`` maps raw ids created by the scenario to stable tokens
    (``{1234: "<entity-1>"}``); only those ids are rewritten, so unrelated
    ids still diff.
    """
    id_tokens = id_tokens or {}
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if _is_timestamp_key(key):
                result[key] = TIMESTAMP_PLACEHOLDER if item is not None else None
            elif _is_secret_key(key):
                result[key] = SECRET_PLACEHOLDER if item is not None else None
            else:
                result[key] = normalise_json(item, id_tokens)
        return result
    if isinstance(value, list):
        return [normalise_json(item, id_tokens) for item in value]
    if isinstance(value, str):
        return _scrub_string(value, id_tokens)
    if isinstance(value, int) and not isinstance(value, bool):
        return id_tokens.get(value, value)
    return value


def normalise_html(text, id_tokens=None):
    """Return HTML (or plain text) with per-request noise removed."""
    text = CSRF_INPUT.sub(
        lambda match: f"{match.group('prefix')}{SECRET_PLACEHOLDER}{match.group('suffix')}",
        text,
    )
    text = CSRF_JS.sub(
        lambda match: f"{match.group('prefix')}{SECRET_PLACEHOLDER}{match.group('suffix')}",
        text,
    )
    text = _scrub_string(text, id_tokens or {})
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line.strip())


def normalise_body(kind, body, id_tokens=None):
    """Normalise a response body according to the probe ``kind``."""
    if kind == "json":
        import json

        try:
            return normalise_json(json.loads(body), id_tokens)
        except ValueError:
            # A probe that should be JSON but is not is a diff in itself;
            # keep the text so the report names the probe, not a stack trace.
            return normalise_html(body, id_tokens)
    return normalise_html(body, id_tokens)
