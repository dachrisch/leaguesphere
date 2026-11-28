"""The six frontend journeys run identically on ref and cand (Phase 3)."""

from . import (  # noqa: F401
    designer_gametable,
    liveticker,
    officials_pages,
    passcheck,
    scorecard_v2_gamesetup,
    scorecard_v2_tracking,
)

JOURNEYS = {
    "scorecard_v2_tracking": scorecard_v2_tracking.run,
    "scorecard_v2_gamesetup": scorecard_v2_gamesetup.run,
    "designer_gametable": designer_gametable.run,
    "officials_pages": officials_pages.run,
    "passcheck": passcheck.run,
    "liveticker": liveticker.run,
}
