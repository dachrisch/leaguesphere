"""Builds the CSV export for the matchreport gameday-list "download" button
- one row per game (Gameinfo) across whatever gamedays the list view is
currently showing, with the officiating team, home/away teams, compliance
violations, and each of the four refereed positions' currently valid
license level.

Query logic here stays bulk (constant query count regardless of how many
gamedays/games are exported) by reusing the same building blocks the list
view itself already uses (compute_gameday_officials_compliance) plus the
officials-domain license resolver (resolve_game_official_licenses) - the
officiating-staff license lookup itself belongs in officials/, not here,
per this app's role (see matchreport/CLAUDE.md): matchreport only wraps it
into the CSV shape.
"""

import csv
import io

from gamedays.models import Gameinfo, Gameresult
from officials.service.game_official_licenses import (
    POSITION_DOWN_JUDGE,
    POSITION_FIELD_JUDGE,
    POSITION_REFEREE,
    POSITION_SIDE_JUDGE,
    resolve_game_official_licenses,
)
from officials.service.officials_compliance_service import (
    compute_gameday_officials_compliance,
)

CSV_HEADER = [
    "gameday_id",
    "gameday name",
    "gameinfo_id",
    "home",
    "away",
    "referee game",
    "violations",
    "Referee license",
    "downjudge license",
    "fieldjudge license",
    "sidejudge license",
]


def build_gameday_list_csv(gamedays) -> str:
    gamedays = list(gamedays)
    gameday_ids = [gd.pk for gd in gamedays]
    gameday_name_by_id = {gd.pk: gd.name for gd in gamedays}

    gameinfos = list(
        Gameinfo.objects.filter(gameday_id__in=gameday_ids)
        .order_by("gameday_id", "id")
        .values("id", "gameday_id", "officials__description")
    )
    gameinfo_ids = [gi["id"] for gi in gameinfos]

    home_team = {}
    away_team = {}
    for r in Gameresult.objects.filter(gameinfo_id__in=gameinfo_ids).values(
        "gameinfo_id", "isHome", "team__description"
    ):
        (home_team if r["isHome"] else away_team)[r["gameinfo_id"]] = r[
            "team__description"
        ]

    compliance_by_gameday = compute_gameday_officials_compliance(gameday_ids)
    licenses_by_gameinfo = resolve_game_official_licenses(gameinfo_ids)

    output = io.StringIO()
    # ";" delimiter matches the existing passcheck CSV download
    # (MatchreportGamedayPasscheckDownloadView), the German-locale-friendly
    # convention already used in this app (Excel uses "," as the decimal
    # separator there, so "," can't double as the field delimiter).
    writer = csv.writer(output, delimiter=";")
    writer.writerow(CSV_HEADER)

    for gi in gameinfos:
        gameinfo_id, gameday_id = gi["id"], gi["gameday_id"]
        violations = compliance_by_gameday[gameday_id].game_violations.get(
            gameinfo_id, []
        )
        positions = licenses_by_gameinfo.get(gameinfo_id, {})
        writer.writerow(
            [
                gameday_id,
                gameday_name_by_id.get(gameday_id, ""),
                gameinfo_id,
                home_team.get(gameinfo_id, ""),
                away_team.get(gameinfo_id, ""),
                gi["officials__description"] or "",
                "; ".join(violations),
                positions.get(POSITION_REFEREE) or "",
                positions.get(POSITION_DOWN_JUDGE) or "",
                positions.get(POSITION_FIELD_JUDGE) or "",
                positions.get(POSITION_SIDE_JUDGE) or "",
            ]
        )

    return output.getvalue()
