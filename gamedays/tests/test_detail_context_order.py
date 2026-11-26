"""Priority invariant for detail contributors (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service import detail_context


def test_contributors_run_in_documented_priority_order():
    calls = []
    detail_context.reset()
    try:
        detail_context.register_contributor(
            "liveticker", 30, lambda d: calls.append("liveticker")
        )
        detail_context.register_contributor(
            "officials", 20, lambda d: calls.append("officials")
        )
        detail_context.register_contributor(
            "league_table", 10, lambda d: calls.append("league_table")
        )
        draft = detail_context.DetailContextDraft(
            request=None,
            gameday=None,
            gs=None,
            render_configs={},
            qualify_table=None,
            final_table=None,
        )
        detail_context.build(draft)
        assert calls == ["league_table", "officials", "liveticker"]
    finally:
        detail_context.reset()


class FakeTable:
    def to_html(self, **kwargs):
        return "<table>"


def test_build_without_contributors_uses_to_html_fallback():
    detail_context.reset()
    draft = detail_context.DetailContextDraft(
        request=None,
        gameday=None,
        gs=None,
        render_configs={},
        qualify_table=FakeTable(),
        final_table=FakeTable(),
    )
    detail_context.build(draft)
    assert draft.qualify_table == "<table>"
    assert draft.final_table == "<table>"


def test_build_fallback_without_a_final_table():
    detail_context.reset()
    draft = detail_context.DetailContextDraft(
        request=None,
        gameday=None,
        gs=None,
        render_configs={},
        qualify_table=FakeTable(),
        final_table=None,
    )
    detail_context.build(draft)
    assert draft.final_table is None
