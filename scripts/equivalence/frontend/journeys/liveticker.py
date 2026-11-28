"""Liveticker journey: public page and its XHR sequence.

The SSE stream is excluded (``/api/liveticker/stream/``), exactly as in the
backend harness (Phase 2 plan §5): an open stream would make a step never
finish and would leak timing noise into the report.
"""

from .common import run_steps


def run(context, run_id, credentials):
    steps, skipped = {}, []
    run_steps(context, "/liveticker/", steps, skipped, prefix="v1-")
    run_steps(context, "/liveticker/v2/", steps, skipped, prefix="v2-")
    return steps, skipped
