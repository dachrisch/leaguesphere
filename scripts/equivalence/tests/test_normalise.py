"""Tests for the equivalence normalisers (Phase 0c, issue #2536).

The noise floor is only trustworthy if the normaliser removes exactly the
per-request noise and nothing else. These tests pin both halves: a planted
nondeterministic payload normalises away, a real difference survives.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import normalise  # noqa: E402


def test_timestamps_and_tokens_are_normalised():
    payload = {
        "updated_at": "2026-11-25T10:11:12.123456Z",
        "created": "2026-11-25T10:11:12Z",
        "csrf_token": "abc123",
        "sessionid": "secret",
        "html": "<div>as of 2026-11-25T10:11:12Z</div>",
    }

    cleaned = normalise.normalise_json(payload)

    assert cleaned["updated_at"] == normalise.TIMESTAMP_PLACEHOLDER
    assert cleaned["created"] == normalise.TIMESTAMP_PLACEHOLDER
    assert cleaned["csrf_token"] == normalise.SECRET_PLACEHOLDER
    assert cleaned["sessionid"] == normalise.SECRET_PLACEHOLDER
    assert cleaned["html"] == f"<div>as of {normalise.TIMESTAMP_PLACEHOLDER}</div>"


def test_asset_hashes_are_normalised():
    payload = {
        "script": "/static/app-3f9a1c2e.js",
        "stylesheet": "/static/style.css?v=9a8b7c6d",
    }

    cleaned = normalise.normalise_json(payload)

    assert cleaned["script"] == f"/static/app.{normalise.ASSET_PLACEHOLDER}.js"
    assert cleaned["stylesheet"] == f"/static/style.css?v={normalise.ASSET_PLACEHOLDER}"


def test_csrf_hidden_input_is_normalised():
    first = '<form><input type="hidden" name="csrfmiddlewaretoken" value="aaa"></form>'
    second = '<form><input type="hidden" name="csrfmiddlewaretoken" value="bbb"></form>'

    assert normalise.normalise_html(first) == normalise.normalise_html(second)


def test_entity_ids_are_normalised_only_when_declared():
    payload = {"id": 1234, "gameday": 77, "name": "run 1234"}

    cleaned = normalise.normalise_json(payload, {1234: "<entity-1>"})

    assert cleaned["id"] == "<entity-1>"
    assert cleaned["gameday"] == 77
    assert cleaned["name"] == "run <entity-1>"


def test_planted_nondeterminism_normalises_away():
    first = {
        "gameday": {"id": 42, "name": "Cup", "updated_at": "2026-11-25T10:00:00Z"},
        "rendered": '<link href="/static/app-1111aaaa.css?v=deadbeef">',
        "token": "one",
    }
    second = {
        "gameday": {"id": 42, "name": "Cup", "updated_at": "2026-11-25T11:00:00Z"},
        "rendered": '<link href="/static/app-2222bbbb.css?v=cafebabe">',
        "token": "two",
    }

    assert normalise.normalise_json(first) == normalise.normalise_json(second)


def test_real_difference_survives_normalisation():
    first = {"game": {"id": 1, "home_score": 3, "updated_at": "2026-11-25T10:00:00Z"}}
    second = {"game": {"id": 1, "home_score": 4, "updated_at": "2026-11-25T10:00:00Z"}}

    assert normalise.normalise_json(first) != normalise.normalise_json(second)
