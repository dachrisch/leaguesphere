"""Single-pass ordered detail-context contributors (Phase 1, #2537).

The gameday detail page composes sections owned by three consumer apps.
Contributors run in a documented priority order (league_table 10, officials
20, liveticker 30) against one mutable draft, so interleaved side effects are
explicit and the order can be pinned by a test.
"""

from __future__ import annotations

from dataclasses import dataclass, field

CONTRIBUTORS: dict[str, tuple] = {}


@dataclass
class DetailContextDraft:
    request: object
    gameday: object
    gs: object
    context: dict = field(default_factory=dict)
    render_configs: dict = field(default_factory=dict)
    config: dict = field(default_factory=dict)
    qualify_table: object = None
    final_table: object = None
    officials: list = field(default_factory=list)
    url_pattern_official: str = ""
    url_pattern_official_signup: str = ""
    url_pattern_liveticker: str = ""
    allow_officials_to_register: bool | None = None
    today_status_by_gameday: dict = field(default_factory=dict)


def register_contributor(name, priority, contributor):
    """Register (or replace) a contributor; lower priority runs first."""
    CONTRIBUTORS[name] = (priority, contributor)


def reset():
    CONTRIBUTORS.clear()


def build(draft):
    """Run every registered contributor in priority order; return the draft."""
    for name, (priority, contributor) in sorted(
        CONTRIBUTORS.items(), key=lambda item: item[1][0]
    ):
        contributor(draft)
    if "league_table" not in CONTRIBUTORS:
        # Documented fallback: without the league_table contributor the
        # original view rendered the raw tables as HTML itself.
        draft.qualify_table = draft.qualify_table.to_html(**draft.render_configs)
        if draft.final_table is not None:
            draft.final_table = draft.final_table.to_html(**draft.render_configs)
    return draft
