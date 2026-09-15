import json

import pytest

from cursor_overlay import (
    CURSOR_ID,
    RIPPLE_ID,
    build_clear_ripple_script,
    build_clear_script,
    build_click_script,
    build_move_script,
    ease_out_cubic,
    interpolate_points,
)


def test_move_script_embeds_cursor_id_and_coords():
    script = build_move_script(123.456, 78.9)
    assert json.dumps(CURSOR_ID) in script
    assert "123.5px" in script
    assert "78.9px" in script


def test_click_script_embeds_ripple_id_and_coords():
    script = build_click_script(50, 60)
    assert json.dumps(RIPPLE_ID) in script
    assert "50" in script and "60" in script


def test_clear_ripple_script_only_touches_ripple():
    script = build_clear_ripple_script()
    assert json.dumps(RIPPLE_ID) in script
    assert json.dumps(CURSOR_ID) not in script


def test_clear_script_removes_both_overlay_ids():
    script = build_clear_script()
    assert json.dumps(CURSOR_ID) in script
    assert json.dumps(RIPPLE_ID) in script
    assert script.count("remove()") == 2


def test_interpolate_points_last_point_lands_exactly_on_end():
    points = interpolate_points((0, 0), (10, 20), 4)
    assert len(points) == 4
    assert points[-1] == (10.0, 20.0)


def test_interpolate_points_are_evenly_spaced_without_easing():
    points = interpolate_points((0, 0), (10, 0), 2, ease=None)
    assert points == [(5.0, 0.0), (10.0, 0.0)]


def test_interpolate_points_default_easing_front_loads_movement():
    # Ease-out: the eye is on the target near the end, so later steps should be
    # smaller than an even (linear) split would give -- most of the ground is
    # covered early, not right before arrival.
    points = interpolate_points((0, 0), (10, 0), 2)
    first_leg = points[0][0] - 0
    second_leg = points[1][0] - points[0][0]
    assert first_leg > second_leg


def test_interpolate_points_rejects_non_positive_steps():
    with pytest.raises(ValueError):
        interpolate_points((0, 0), (1, 1), 0)


def test_ease_out_cubic_endpoints():
    assert ease_out_cubic(0) == 0
    assert ease_out_cubic(1) == 1


def test_ease_out_cubic_front_loaded():
    # More than halfway there by the midpoint -- deceleration into the target.
    assert ease_out_cubic(0.5) > 0.5
