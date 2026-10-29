"""The scorecard's legacy ``event`` list -> slice-1 envelopes.

One table, no logic scattered across views: the app keeps posting the payload
it posts today and this module says what each name means in the event
vocabulary. ``gameevents/tests/golden_cases.py`` holds the same payloads as
envelopes, and ``test_legacy_translation.py`` asserts the table maps one to the
other exactly -- so the shadow append records the events the legacy writer's
rows stand for, and the canonical endpoint writes the same rows for a legacy
body.

An unknown name is ``UnsupportedEventCode`` (HTTP 400), never a silently
dropped event: a dropped scoring play is worse than a rejected request.

Two quirks are carried over deliberately:

- a jersey arrives as free text; it is sanitised by the legacy writer's own
  ``_coerce_player`` (``"51.85"`` -> 51, garbage -> no jersey), because the
  projected row must match the row that writer produced;
- ``Strafe`` carries its penalty name in the payload's ``input``; the envelope
  has no separate field for it, so it becomes the event ``code`` (the
  projector writes it back into ``TeamLog.input``).
"""

from dataclasses import dataclass
from typing import Optional

from gameevents.service.projector import (
    GameEventValue,
    InvalidEnvelope,
    UnsupportedEventCode,
)
from gamedays.service.gamelog import GameLogCreator


@dataclass(frozen=True)
class LegacyEvent:
    """What one legacy event ``name`` stands for.

    ``code`` is the envelope code; ``None`` means it is taken from the payload
    (the penalty name) or from the side (a timeout), and ``points`` is the
    safety value the legacy name encoded. ``carries_side`` is false for the
    period markers, whose rows have no team.
    """

    type: str
    code: Optional[str] = None
    points: Optional[int] = None
    carries_side: bool = True
    input_in_payload: bool = False


# Table-driven on purpose: adding a name is one line, and the coverage test in
# test_legacy_translation.py makes an accidental rename visible.
LEGACY_EVENTS = {
    "Touchdown": LegacyEvent("score", "touchdown"),
    "1-Extra-Punkt": LegacyEvent("score", "pat1"),
    "2-Extra-Punkte": LegacyEvent("score", "pat2"),
    "Overtime": LegacyEvent("score", "overtime"),
    "Safety (+1)": LegacyEvent("score", "safety", points=1),
    "Safety (+2)": LegacyEvent("score", "safety", points=2),
    "Turnover": LegacyEvent("possession", "turnover"),
    "Interception": LegacyEvent("possession", "interception"),
    "First Down": LegacyEvent("series", "first_down"),
    # The configured penalty name is the envelope code; see module docstring.
    "Strafe": LegacyEvent("penalty"),
    "Spielzeit": LegacyEvent("time", "clock", input_in_payload=True),
    "Auszeit": LegacyEvent("timeout", input_in_payload=True),
    # Markers are written by GameService, not by a POST; they are translated
    # anyway so a log import or a future client cannot lose them.
    "Spiel gestartet": LegacyEvent("period", "start", carries_side=False),
    "2. Halbzeit gestartet": LegacyEvent("period", "half_time", carries_side=False),
    "Spiel beendet": LegacyEvent("period", "end", carries_side=False),
}


def from_legacy_entry(
    entry: dict,
    *,
    side: Optional[str],
    half: int,
    seq: Optional[int] = None,
    client_id: Optional[str] = None,
    legacy_sequence: Optional[int] = None,
) -> GameEventValue:
    """Translate one ``{name, player?, input?}`` entry."""

    name = entry.get("name")
    try:
        spec = LEGACY_EVENTS[name]
    except (KeyError, TypeError):
        raise UnsupportedEventCode(f"unknown legacy event {name!r}") from None

    payload: dict = {}
    code = spec.code
    if spec.type == "penalty":
        code = entry.get("input")
        if not isinstance(code, str) or not code.strip():
            raise InvalidEnvelope("a Strafe entry needs its penalty name in input")
    elif spec.type == "timeout":
        code = side
        if entry.get("input") is not None:
            payload = {"input": entry["input"]}
    elif spec.type == "time":
        if entry.get("input") is not None:
            payload = {"input": entry["input"]}
    elif spec.points is not None:
        payload = {"points": spec.points}

    return GameEventValue(
        type=spec.type,
        code=code or "",
        side=side if spec.carries_side else None,
        player=(
            GameLogCreator._coerce_player(entry.get("player"))
            if spec.carries_side
            else None
        ),
        period=half,
        payload=payload,
        seq=seq,
        client_id=client_id,
        legacy_sequence=legacy_sequence,
    )


def from_legacy_entries(
    entries: list,
    *,
    side: Optional[str],
    half: int,
    first_seq: Optional[int] = None,
    client_id: Optional[str] = None,
    legacy_sequence: Optional[int] = None,
) -> list[GameEventValue]:
    """Translate one submission (all entries of one POST).

    ``first_seq=None`` leaves ``seq`` unassigned: the append service allocates
    it (the legacy payload's own order is all the client provides).
    ``legacy_sequence`` is the ``TeamLog.sequence`` the legacy writer used for
    this submission; the shadow passes it so corrections address the rows that
    really exist (see ``GameEvent.legacy_sequence``).
    """

    if not isinstance(entries, list) or not entries:
        raise InvalidEnvelope("a submission needs a non-empty list of events")
    return [
        from_legacy_entry(
            entry,
            side=side,
            half=half,
            seq=None if first_seq is None else first_seq + offset,
            client_id=client_id,
            legacy_sequence=legacy_sequence,
        )
        for offset, entry in enumerate(entries)
    ]
