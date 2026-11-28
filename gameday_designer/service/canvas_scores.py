"""Result mirroring onto the designer canvas (moved from gamedays, N3)."""

from gamedays.models import GamedayDesignerState


def sync_canvas_node_scores(game, halftime_score, final_score):
    """Mirror a game result into its designer canvas node (server-side).

    The canvas stores each game's scores in the node ``data``. On a locked
    (published) gameday the client may not PUT the whole ``state_data`` blob,
    so the result endpoint owns this single-node sync. The node is resolved
    via ``Gameinfo.designer_node_id`` (set by CanvasPublishService); rows
    without one (e.g. Swiss games) are skipped.
    """
    node_id = game.designer_node_id
    if not node_id:
        return
    try:
        state = GamedayDesignerState.objects.select_for_update().get(
            gameday_id=game.gameday_id
        )
    except GamedayDesignerState.DoesNotExist:
        return
    state_data = dict(state.state_data or {})
    nodes = state_data.get("nodes")
    if not isinstance(nodes, list):
        return
    for node in nodes:
        if node.get("id") != node_id:
            continue
        data = dict(node.get("data") or {})
        if halftime_score is not None:
            data["halftime_score"] = halftime_score
        if final_score is not None:
            data["final_score"] = final_score
        node["data"] = data
        state.state_data = state_data
        state.save(update_fields=["state_data"])
        return
