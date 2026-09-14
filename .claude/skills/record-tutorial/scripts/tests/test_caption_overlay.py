import json

from caption_overlay import OVERLAY_ID, build_caption_script, build_clear_script


def test_caption_script_embeds_overlay_id():
    script = build_caption_script("Open the Gameday Designer")
    assert json.dumps(OVERLAY_ID) in script


def test_caption_script_embeds_caption_as_json_string():
    script = build_caption_script("Open the Gameday Designer")
    assert json.dumps("Open the Gameday Designer") in script


def test_caption_script_safely_escapes_hostile_caption():
    hostile = '"; document.body.innerHTML=""; //'
    script = build_caption_script(hostile)
    # The only way the hostile text can appear is inside a JSON-encoded
    # string literal -- never as a bare, breakable JS expression.
    assert json.dumps(hostile) in script
    assert 'document.body.innerHTML=""; //"' not in script.replace(json.dumps(hostile), "")


def test_clear_script_removes_overlay_by_id():
    script = build_clear_script()
    assert json.dumps(OVERLAY_ID) in script
    assert "remove()" in script
