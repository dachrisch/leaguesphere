import pytest
from pathlib import Path

from storyboard import Step, StoryboardError, parse_storyboard, load_storyboard

VALID = """\
# Gameday Designer basics

## Step 1
- caption: Open the Gameday Designer
- action: navigate
- target: /designer/
- hold: 3

## Step 2
- caption: Click "New template"
- action: click
- target: [data-testid="new-template-button"]
- hold: 2.5
"""


def test_parses_ordered_steps():
    steps = parse_storyboard(VALID)
    assert steps == [
        Step(caption="Open the Gameday Designer", action="navigate", target="/designer/", hold=3.0),
        Step(
            caption='Click "New template"',
            action="click",
            target='[data-testid="new-template-button"]',
            hold=2.5,
        ),
    ]


def test_rejects_missing_required_field():
    text = "## Step 1\n- caption: Open it\n- action: navigate\n- hold: 3\n"
    with pytest.raises(StoryboardError, match="missing required field 'target'"):
        parse_storyboard(text)


def test_rejects_invalid_action():
    text = "## Step 1\n- caption: c\n- action: teleport\n- target: t\n- hold: 1\n"
    with pytest.raises(StoryboardError, match="invalid action 'teleport'"):
        parse_storyboard(text)


def test_rejects_non_numeric_hold():
    text = "## Step 1\n- caption: c\n- action: wait\n- target: t\n- hold: soon\n"
    with pytest.raises(StoryboardError, match="non-numeric hold"):
        parse_storyboard(text)


def test_rejects_non_positive_hold():
    text = "## Step 1\n- caption: c\n- action: wait\n- target: t\n- hold: 0\n"
    with pytest.raises(StoryboardError, match="hold must be positive"):
        parse_storyboard(text)


def test_rejects_storyboard_with_no_steps():
    with pytest.raises(StoryboardError, match="no '## Step' sections"):
        parse_storyboard("# Just a title, no steps\n")


def test_load_storyboard_reads_file(tmp_path: Path):
    p = tmp_path / "story.md"
    p.write_text(VALID)
    assert load_storyboard(p) == parse_storyboard(VALID)


def test_load_storyboard_accepts_string_path(tmp_path: Path):
    p = tmp_path / "story.md"
    p.write_text(VALID)
    assert load_storyboard(str(p)) == parse_storyboard(VALID)
