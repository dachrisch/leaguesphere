"""Build the JS snippet used to show/update the burned-in caption overlay."""
import json

OVERLAY_ID = "lsphere-tutorial-caption"

_INJECT_TEMPLATE = """\
(function() {{
  var el = document.getElementById({overlay_id});
  if (!el) {{
    el = document.createElement('div');
    el.id = {overlay_id};
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'background:rgba(0,0,0,0.75);color:#fff;font:600 28px/1.4 sans-serif;' +
      'text-align:center;padding:16px 24px;pointer-events:none;';
    document.body.appendChild(el);
  }}
  el.textContent = {caption};
}})();
"""


def build_caption_script(caption: str) -> str:
    """Return a JS snippet that creates (if needed) and updates the caption overlay.

    Both the element id and the caption text are JSON-encoded before being
    embedded, so arbitrary caption text (quotes, backslashes, HTML) can
    never break out of the JS string literal it's embedded in.
    """
    return _INJECT_TEMPLATE.format(overlay_id=json.dumps(OVERLAY_ID), caption=json.dumps(caption))


def build_clear_script() -> str:
    """Return a JS snippet that removes the caption overlay, if present."""
    return (
        "(function() { var el = document.getElementById(%s); "
        "if (el) { el.remove(); } })();" % json.dumps(OVERLAY_ID)
    )
