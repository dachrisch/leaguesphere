"""Build the JS snippets used to draw a synthetic mouse cursor and click indicator.

A slideshow of before/after page states doesn't show *where* the action happened --
viewers can't follow along. These snippets draw a small pointer overlay that moves
across a handful of interpolated frames toward the target element, then flashes an
expanding ring at the click point, so the recorded video reads as "the mouse moved
here and clicked" instead of a silent jump-cut between states.
"""
from __future__ import annotations

import json

CURSOR_ID = "lsphere-tutorial-cursor"
RIPPLE_ID = "lsphere-tutorial-click-ripple"

_MOVE_TEMPLATE = """\
(function() {{
  var el = document.getElementById({cursor_id});
  if (!el) {{
    el = document.createElement('div');
    el.id = {cursor_id};
    el.style.cssText = 'position:fixed;z-index:2147483647;width:0;height:0;' +
      'pointer-events:none;border-left:9px solid transparent;' +
      'border-right:9px solid transparent;border-top:18px solid #ff3b30;' +
      'filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 2px 3px rgba(0,0,0,.6));' +
      'transform:rotate(-40deg);transform-origin:0 0;transition:none;';
    document.body.appendChild(el);
  }}
  el.style.left = {x}px;
  el.style.top = {y}px;
}})();
"""

_CLICK_TEMPLATE = """\
(function() {{
  var old = document.getElementById({ripple_id});
  if (old) old.remove();
  var r = document.createElement('div');
  r.id = {ripple_id};
  var size = {size};
  r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;' +
    'left:' + ({x} - size / 2) + 'px;top:' + ({y} - size / 2) + 'px;' +
    'width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
    'border:3px solid #ff3b30;background:rgba(255,59,48,{opacity});box-sizing:border-box;';
  document.body.appendChild(r);
}})();
"""

_CLEAR_TEMPLATE = """\
(function() {{
  var c = document.getElementById({cursor_id});
  if (c) c.remove();
  var r = document.getElementById({ripple_id});
  if (r) r.remove();
}})();
"""

_CLEAR_RIPPLE_TEMPLATE = """\
(function() {{
  var r = document.getElementById({ripple_id});
  if (r) r.remove();
}})();
"""


def build_move_script(x: float, y: float) -> str:
    """Return JS that creates (if needed) and repositions the synthetic cursor at (x, y)."""
    return _MOVE_TEMPLATE.format(cursor_id=json.dumps(CURSOR_ID), x=round(x, 1), y=round(y, 1))


def build_click_script(x: float, y: float, size: int = 30, opacity: float = 0.35) -> str:
    """Return JS that draws an expanding-ring click indicator centered at (x, y)."""
    return _CLICK_TEMPLATE.format(
        ripple_id=json.dumps(RIPPLE_ID), x=round(x, 1), y=round(y, 1),
        size=size, opacity=opacity,
    )


def build_clear_ripple_script() -> str:
    """Return JS that removes just the click ripple, leaving the cursor in place."""
    return _CLEAR_RIPPLE_TEMPLATE.format(ripple_id=json.dumps(RIPPLE_ID))


def build_clear_script() -> str:
    """Return JS that removes both the synthetic cursor and any click ripple."""
    return _CLEAR_TEMPLATE.format(cursor_id=json.dumps(CURSOR_ID), ripple_id=json.dumps(RIPPLE_ID))


def ease_out_cubic(t: float) -> float:
    """Cubic ease-out: large early steps that shrink toward the target (t in [0, 1]).

    A real mouse accelerates then decelerates into where it stops; a handful of
    *linearly* spaced frames instead reads as a couple of teleports because the
    steps near the target -- where the eye is looking -- are exactly as big as the
    ones at the start. Easing concentrates the frames where they're needed.
    """
    return 1 - (1 - t) ** 3


def interpolate_points(
    start: tuple[float, float], end: tuple[float, float], steps: int, ease=ease_out_cubic
) -> list[tuple[float, float]]:
    """Return `steps` interpolated points from start to end (start excluded, end included).

    E.g. ``interpolate_points((0, 0), (10, 0), 2, ease=None)`` ->
    ``[(5.0, 0.0), (10.0, 0.0)]``: the last point always lands exactly on ``end``, so
    callers can treat it as the click position. ``steps`` should be large enough for
    the motion to read as movement rather than a jump -- single digits at minimum
    (e.g. 6-8) for a typical on-screen distance; too few and it looks cheap
    regardless of easing. Pass ``ease=None`` for plain linear spacing.
    """
    if steps < 1:
        raise ValueError("steps must be >= 1")
    sx, sy = start
    ex, ey = end
    points = []
    for i in range(1, steps + 1):
        t = i / steps
        if ease is not None:
            t = ease(t)
        points.append((sx + (ex - sx) * t, sy + (ey - sy) * t))
    return points
