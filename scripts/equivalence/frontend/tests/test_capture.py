"""Characterization of the frontend capture primitives (Phase 3 Layer 1)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
for part in ("scripts/equivalence", "scripts/equivalence/frontend"):
    sys.path.insert(0, str(ROOT / part))

import capture  # noqa: E402
from diff import Diff  # noqa: E402


class FakeLocator:
    def __init__(self, aria):
        self.aria = aria

    def aria_snapshot(self):
        return self.aria


class FakePage:
    def __init__(self, text="body text", aria="- generic: body"):
        self.text = text
        self.aria = aria

    def evaluate(self, script):
        return self.text

    def locator(self, selector):
        assert selector == "body"
        return FakeLocator(self.aria)


def test_body_shape_covers_every_json_type():
    assert capture.body_shape({"b": 1, "a": {"c": None}}) == {
        "a": {"c": "null"},
        "b": "number",
    }
    # Every array element and its length are part of the shape: dropping the
    # tail would hide a write that added an event to the captured body.
    assert capture.body_shape([{"x": True}, "ignored"]) == {
        "len": 2,
        "items": [{"x": "bool"}, "string"],
    }
    assert capture.body_shape([]) == {"len": 0, "items": []}
    assert capture.body_shape(1.5) == "number"
    assert capture.body_shape("text") == "string"
    assert capture.body_shape(None) == "null"
    assert capture.body_shape(object()) == "other"


def test_request_shape_empty_parsed_and_unparsed():
    assert capture.request_shape("") == "empty"
    assert capture.request_shape(None) == "empty"
    assert capture.request_shape('{"id": 12}') == {"id": "number"}
    assert capture.request_shape("not json") == "unparsed"


def test_normalise_path_sorts_query_and_scrubs_ids():
    tokens = {4711: "<entity-1>"}
    path = capture.normalise_path(
        "https://stage/api/gamedays/4711/?b=2&a=1&created_at=2026-11-26T10:00:00Z",
        tokens,
    )
    assert path == "/api/gamedays/<entity-1>/?a=1&b=2&created_at=<timestamp>"
    assert capture.normalise_path("/api/gamedays/") == "/api/gamedays/"


def test_normalise_request_uses_method_and_body_shape():
    assert capture.normalise_request({}) == {
        "method": "GET",
        "path": "",
        "body_shape": "empty",
    }
    assert capture.normalise_request(
        {
            "method": "post",
            "url": "/api/games/?z=1&a=2",
            "body": json.dumps({"x": "secret-value"}),
        }
    ) == {
        "method": "POST",
        "path": "/api/games/?a=2&z=1",
        "body_shape": {"x": "string"},
    }


def test_normalise_dom_filters_volatile_nodes_and_scrubs_values():
    text = "\n".join(
        [
            "Spielstand 12:7",
            "vor 3 s",
            "gerade eben",
            "- button: Spiel erfassen [focused]",
            "fade-in active",
            '<input name="csrfmiddlewaretoken" value="abc"> created_at=2026-11-26T10:00:00Z',
        ]
    )
    result = capture.normalise_dom(text, {4711: "<entity-1>"})
    assert "Spielstand 12:7" in result
    assert "vor 3 s" not in result
    assert "gerade eben" not in result
    assert "[focused]" not in result
    assert "fade-in" not in result
    # Only the volatile token is stripped: the rest of the ARIA line survives
    # so a button that disappears on one side is still a real diff.
    assert "- button: Spiel erfassen" in result
    assert result.count("<time>") == 2
    assert "<redacted>" in result and "<timestamp>" in result
    # An explicit empty allowlist proves the filter, not the normaliser, drops them.
    unfiltered = capture.normalise_dom(text, volatile=())
    assert "vor 3 s" in unfiltered
    assert "fade-in" in unfiltered


def test_step_capture_records_only_api_requests_except_sse():
    collector = capture.StepCapture()
    collector.record({"url": "/static/app.js", "method": "GET"})
    collector.record({"url": "/api/liveticker/stream/", "method": "GET"})
    collector.record({"url": "/api/gamedays/?b=2&a=1", "method": "GET"})
    collector.record({"url": "/api/games/12", "method": "POST", "body": '{"a":1}'})
    assert collector.as_list() == [
        {"method": "GET", "path": "/api/gamedays/?a=1&b=2", "body_shape": "empty"},
        {"method": "POST", "path": "/api/games/12", "body_shape": {"a": "number"}},
    ]
    snapshot = collector.as_list()
    snapshot.clear()
    assert len(collector.as_list()) == 2  # returned list is a copy

    tokenised = capture.StepCapture({12: "<entity-2>"})
    tokenised.record({"url": "/api/games/12", "method": "GET"})
    assert tokenised.as_list()[0]["path"] == "/api/games/<entity-2>"


def test_capture_step_with_and_without_an_existing_collector():
    page = FakePage()
    with_collector = capture.StepCapture({7: "<entity-1>"})
    with_collector.record({"url": "/api/games/7", "method": "GET"})
    result = capture.capture_step(page, capture=with_collector)
    assert result["requests"][0]["path"] == "/api/games/<entity-1>"
    assert result["dom"] == "body text"
    assert result["aria"] == "- generic: body"

    fresh = capture.capture_step(page, tokens={})
    assert fresh["requests"] == []


def test_compare_steps_covers_missing_extra_changed_and_equal():
    left = {
        "open": {"requests": [], "dom": "a", "aria": "a"},
        "changed": {"requests": [], "dom": "old", "aria": "a"},
        "extra": {"requests": [], "dom": "a", "aria": "a"},
    }
    right = {
        "open": {"requests": [], "dom": "a", "aria": "a"},
        "changed": {"requests": [], "dom": "new", "aria": "a"},
        "missing": {"requests": [], "dom": "a", "aria": "a"},
    }
    diffs = capture.compare_steps(left, right, "tracking")
    assert diffs["tracking:changed"] == [Diff("$.dom:line 1", "replace")]
    assert diffs["tracking:extra"] == [Diff("$", "missing")]
    assert diffs["tracking:missing"] == [Diff("$", "extra")]
    assert "tracking:open" not in diffs


def test_compare_steps_reports_line_numbers_and_optional_state():
    left = {
        "step": {
            "requests": [{"method": "POST", "path": "/api/x", "body_shape": "empty"}],
            "dom": "one\ntwo\nthree",
            "aria": "- button: Spiel",
            "absent": [],
        }
    }
    right = {
        "step": {
            "requests": [{"method": "POST", "path": "/api/x", "body_shape": "empty"}],
            "dom": "one\nTWO\nthree",
            "aria": "- button: Spiel [focused]",
            "absent": ["optional-target"],
        }
    }
    diffs = capture.compare_steps(left, right, "tracking")
    assert Diff("$.dom:line 2", "replace") in diffs["tracking:step"]
    assert Diff("$.aria:line 1", "replace") in diffs["tracking:step"]
    assert Diff("$.absent[]", "length") in diffs["tracking:step"]
    # Requests are structural; only DOM/ARIA text is diffed by line.
    assert not any(item.path.startswith("$.requests") for item in diffs["tracking:step"])
