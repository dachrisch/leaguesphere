"""Pure card builders for the personal home page.

One function per card, no database access and no template logic: the service
layer fetches, these functions decide what the page says. Every card returns
the same small dict shape so the template stays dumb:

    {"key", "title", "severity", "severity_text", "summary", "rows", "links"}

``severity_text`` always states the meaning in words - colour alone must never
be the only carrier (issue #2078).
"""

from datetime import date

SEVERITY_DANGER = "danger"
SEVERITY_WARNING = "warning"
SEVERITY_OK = "ok"
SEVERITY_INFO = "info"

SEVERITY_TEXT = {
    SEVERITY_DANGER: "Offen",
    SEVERITY_WARNING: "Achtung",
    SEVERITY_OK: "Erledigt",
    SEVERITY_INFO: "Hinweis",
}


def _format_date(day: date) -> str:
    return day.strftime("%d.%m.%Y")


def _countdown(day: date, today: date) -> str:
    days = (day - today).days
    if days == 0:
        return "heute"
    if days == 1:
        return "in 1 Tag"
    if days > 1:
        return f"in {days} Tagen"
    return f"vor {abs(days)} Tagen"


def _plural(count: int, singular: str, plural: str) -> str:
    return singular if count == 1 else plural


def _check(status: str, title: str, reason: str, *, url=None, label=None) -> dict:
    return {
        "status": status,
        "status_text": SEVERITY_TEXT[status],
        "title": title,
        "reason": reason,
        "url": url,
        "label": label,
    }


def _check_card(key: str, title: str, checks: list, *, summary: str = "") -> dict:
    open_count = sum(1 for check in checks if check["status"] != SEVERITY_OK)
    if any(check["status"] == SEVERITY_DANGER for check in checks):
        severity = SEVERITY_DANGER
    elif any(check["status"] == SEVERITY_WARNING for check in checks):
        severity = SEVERITY_WARNING
    else:
        severity = SEVERITY_OK
    return {
        "key": key,
        "title": title,
        "severity": severity,
        "severity_text": SEVERITY_TEXT[severity],
        "summary": summary,
        "rows": checks,
        "open_count": open_count,
        "links": [],
    }


def next_gameday_card(gameday, games, today: date):
    """Countdown, date, field and first kickoff of the team's next gameday."""
    if gameday is None:
        return None

    rows = []
    for game in games:
        kickoff = game["scheduled"]
        kickoff_text = kickoff.strftime("%H:%M") if kickoff else "Zeit offen"
        rows.append(
            {
                "text": f"{kickoff_text} · Feld {game['field']} · {game['opponent']}",
                "opponent": game["opponent"],
                "previous_score": game.get("previous_score"),
            }
        )

    summary = f"{gameday.name} · {_format_date(gameday.date)} · {_countdown(gameday.date, today)}"
    if games and games[0]["scheduled"]:
        summary += f" · erster Anpfiff {games[0]['scheduled'].strftime('%H:%M')}"
    fields = sorted({game["field"] for game in games}) if games else []
    if len(fields) == 1:
        summary += f" · Feld {fields[0]}"
    elif len(fields) > 1:
        summary += f" · {len(fields)} Felder"

    return {
        "key": "next_gameday",
        "title": "Nächster Spieltag",
        "severity": SEVERITY_OK,
        "severity_text": "Geplant",
        "summary": summary,
        "rows": rows,
        "links": [],
    }


def roster_checks_card(
    active_players: int,
    players_without_jersey: int,
    minimum_player_strength: int | None,
):
    """Roster checks built only from existing data and the league's own rule.

    Without an ``EligibilityRule`` for the league there is no minimum to check,
    so no roster-size row is invented.
    """
    checks = []

    if minimum_player_strength is not None:
        if active_players < minimum_player_strength:
            checks.append(
                _check(
                    SEVERITY_DANGER,
                    f"Nur {active_players} aktive Spieler – "
                    f"Liga-Minimum ist {minimum_player_strength}",
                    "Der Kader muss den Spieltag vollständig abdecken.",
                    label="Kader",
                )
            )
        else:
            checks.append(
                _check(
                    SEVERITY_OK,
                    f"Kader erfüllt das Liga-Minimum "
                    f"({active_players} von {minimum_player_strength})",
                    "Alle Spieler sind aktiv gemeldet.",
                    label="Kader",
                )
            )

    if players_without_jersey:
        checks.append(
            _check(
                SEVERITY_WARNING,
                f"{players_without_jersey} Spieler ohne Trikotnummer",
                "Ohne Nummer ist der Spieler am Spieltag nicht eindeutig erfassbar.",
                label="Kader",
            )
        )
    else:
        checks.append(
            _check(
                SEVERITY_OK,
                "Trikotnummern vollständig",
                "Jeder aktive Spieler hat eine Nummer.",
                label="Kader",
            )
        )

    return _check_card("roster_checks", "Vor dem Spieltag zu erledigen", checks)


def pending_transfers_card(transfers: list):
    if not transfers:
        return None

    count = len(transfers)
    rows = [
        {
            "text": (
                f"{transfer['player_name']} · seit "
                f"{_format_date(transfer['since'])}"
            )
        }
        for transfer in transfers
    ]
    return {
        "key": "pending_transfers",
        "title": f"{count} {_plural(count, 'Transfer wartet', 'Transfers warten')} "
        "auf Freigabe",
        "severity": SEVERITY_WARNING,
        "severity_text": SEVERITY_TEXT[SEVERITY_WARNING],
        "summary": "Zugänge für dieses Team brauchen eine Freigabe.",
        "rows": rows,
        "open_count": count,
        "links": [],
    }


def officials_ready_card(assigned_officials: int):
    if assigned_officials:
        return {
            "key": "officials_ready",
            "title": "Schiedsrichter zugewiesen",
            "severity": SEVERITY_OK,
            "severity_text": SEVERITY_TEXT[SEVERITY_OK],
            "summary": f"{assigned_officials} Offizielle eingetragen.",
            "rows": [],
            "links": [],
        }
    return {
        "key": "officials_ready",
        "title": "Noch keine Schiedsrichter eingetragen",
        "severity": SEVERITY_WARNING,
        "severity_text": SEVERITY_TEXT[SEVERITY_WARNING],
        "summary": "Noch keine Schiedsrichter eingetragen – ohne Offizielle "
        "findet der Spieltag nicht statt.",
        "rows": [],
        "links": [],
    }


def last_gameday_summary_card(
    gameday, own_score, opponent_score, opponent, moments: list
):
    """Score and scoring moments of the last gameday.

    ``moments`` carry jersey numbers only (``TeamLog.player`` is a number, not a
    player reference); names are deliberately never resolved here.
    """
    if gameday is None:
        return None

    own = "–" if own_score is None else own_score
    against = "–" if opponent_score is None else opponent_score

    rows = []
    for moment in moments:
        if moment["player"] is None:
            label = f"ohne Nummer · {moment['count']}×"
        else:
            label = f"#{moment['player']} · {moment['count']}×"
        rows.append({"event": moment["event"], "label": label})

    return {
        "key": "last_gameday",
        "title": "Letzter Spieltag",
        "severity": SEVERITY_INFO,
        "severity_text": SEVERITY_TEXT[SEVERITY_INFO],
        "summary": f"{gameday.name} · {_format_date(gameday.date)}",
        "score": f"{own} : {against}",
        "opponent": opponent,
        "moments": rows,
        "rows": rows,
        "links": [],
    }


def table_delta_card(previous_rank, current_rank):
    """Movement caused by the last gameday: rank before it vs. rank now."""
    if previous_rank is None or current_rank is None:
        return None

    if current_rank < previous_rank:
        severity = SEVERITY_OK
        severity_text = "verbessert"
    elif current_rank > previous_rank:
        severity = SEVERITY_WARNING
        severity_text = "verschlechtert"
    else:
        severity = SEVERITY_INFO
        severity_text = "unverändert"

    return {
        "key": "table_delta",
        "title": "Tabellenplatz",
        "severity": severity,
        "severity_text": severity_text,
        "summary": f"{previous_rank} → {current_rank}",
        "text": f"{previous_rank} → {current_rank}",
        "rows": [],
        "links": [],
    }


def staff_readiness_card(
    gameday,
    game_count: int,
    officials_assigned: int,
    understaffed_games: int,
    draft_gamedays: list,
    expiring_licences: int,
):
    checks = []

    if understaffed_games:
        checks.append(
            _check(
                SEVERITY_WARNING,
                f"{understaffed_games} "
                f"{_plural(understaffed_games, 'Spiel', 'Spiele')} "
                "ohne vollständige Besetzung",
                "Die zugewiesenen Offiziellen erfüllen die Mindestbesetzung nicht.",
                label="Zuweisen",
            )
        )
    if draft_gamedays:
        names = ", ".join(draft_gamedays)
        checks.append(
            _check(
                SEVERITY_WARNING,
                f"{len(draft_gamedays)} "
                f"{_plural(len(draft_gamedays), 'Spieltag ist', 'Spieltage sind')} "
                "noch Entwurf",
                f"Noch nicht veröffentlicht: {names}.",
                label="Prüfen",
            )
        )
    if expiring_licences:
        checks.append(
            _check(
                SEVERITY_WARNING,
                f"{expiring_licences} "
                f"{_plural(expiring_licences, 'Lizenz läuft', 'Lizenzen laufen')} ab",
                "Vor dem nächsten Spieltag nicht mehr gültig.",
                label="Offizielle",
            )
        )

    if not checks:
        checks.append(
            _check(
                SEVERITY_OK,
                "Alles bereit",
                f"{game_count} Spiele, {officials_assigned} Offizielle eingetragen.",
            )
        )

    return _check_card(
        "staff_readiness",
        f"Bereitschaft · {gameday.name}" if gameday is not None else "Bereitschaft",
        checks,
        summary=f"{officials_assigned} Offizielle · {game_count} Spiele",
    )


def staff_gameday_nudge_card(
    league,
    season,
    has_template: bool,
    last_gameday_date,
    today: date,
    has_upcoming_gameday: bool,
    season_url: str,
    designer_url: str,
    gameday_create_url: str,
):
    """The 3-step chain Saison -> Vorlage -> Spieltag.

    Rendered only when the league has no upcoming gameday at all. Template
    application is the primary action; the manual form is the fallback.
    """
    if has_upcoming_gameday:
        return None

    steps = [
        {
            "key": "season",
            "label": "Schritt 1",
            "title": "Saison",
            "state": "done" if season is not None else "missing",
            "text": (
                f"Saison {season.name} vorhanden"
                if season is not None
                else "Saison fehlt"
            ),
            "url": season_url,
        },
        {
            "key": "template",
            "label": "Schritt 2",
            "title": "Vorlage",
            "state": "done" if has_template else "missing",
            "text": "Vorlage vorhanden" if has_template else "Keine Vorlage vorhanden",
            "url": designer_url,
        },
        {
            "key": "gameday",
            "label": "Schritt 3",
            "title": "Spieltag",
            "state": "todo",
            "text": "Spieltag anlegen",
            "url": gameday_create_url,
        },
    ]

    if last_gameday_date is not None:
        weeks = (today - last_gameday_date).days // 7
        last_text = (
            f"Letzter Spieltag: {_format_date(last_gameday_date)} – "
            f"vor {weeks} Wochen."
        )
    else:
        last_text = "Noch kein Spieltag angelegt."

    return {
        "key": "staff_gameday_nudge",
        "title": f"Kein Spieltag geplant · {league}",
        "severity": SEVERITY_WARNING,
        "severity_text": SEVERITY_TEXT[SEVERITY_WARNING],
        "summary": last_text,
        "steps": steps,
        "rows": [],
        "links": [
            {
                "label": "Aus Vorlage anwenden",
                "url": designer_url,
                "primary": True,
            },
            {
                "label": "Spieltag manuell anlegen",
                "url": gameday_create_url,
                "primary": False,
            },
        ],
    }


def official_next_signup_card(signup):
    if signup is None:
        return {
            "key": "official_signup",
            "title": "Nächster Einsatz",
            "severity": SEVERITY_INFO,
            "severity_text": SEVERITY_TEXT[SEVERITY_INFO],
            "summary": "Für den nächsten Spieltag liegt keine Anmeldung vor.",
            "rows": [],
            "links": [],
        }

    return {
        "key": "official_signup",
        "title": "Nächster Einsatz",
        "severity": SEVERITY_OK,
        "severity_text": "Eingetragen",
        "summary": (
            f"{signup['gameday']} · {_format_date(signup['date'])} · "
            f"{signup['games']} Spiele"
        ),
        "rows": [],
        "links": [],
    }


def official_licence_card(licence_name):
    if licence_name:
        return {
            "key": "official_licence",
            "title": "Lizenz",
            "severity": SEVERITY_OK,
            "severity_text": "Gültig",
            "summary": f"Lizenz {licence_name} · im laufenden Lizenzjahr erfasst.",
            "rows": [],
            "links": [],
        }
    return {
        "key": "official_licence",
        "title": "Lizenz",
        "severity": SEVERITY_WARNING,
        "severity_text": SEVERITY_TEXT[SEVERITY_WARNING],
        "summary": "Keine Lizenz vorhanden.",
        "rows": [],
        "links": [],
    }


def official_open_results_card(games: list):
    if not games:
        return None

    total = sum(game["count"] for game in games)
    rows = [
        {"text": f"{game['gameday']} · Feld {game['field']} · {game['count']} Spiele"}
        for game in games
    ]
    return {
        "key": "official_open_results",
        "title": "Ergebnisse erfassen",
        "severity": SEVERITY_WARNING,
        "severity_text": SEVERITY_TEXT[SEVERITY_WARNING],
        "summary": f"{total} {_plural(total, 'Spiel', 'Spiele')} ohne Ergebnis.",
        "rows": rows,
        "open_count": total,
        "links": [],
    }


def info_card(key: str, title: str, summary: str, links: list):
    return {
        "key": key,
        "title": title,
        "severity": SEVERITY_INFO,
        "severity_text": SEVERITY_TEXT[SEVERITY_INFO],
        "summary": summary,
        "rows": [],
        "links": links,
    }
