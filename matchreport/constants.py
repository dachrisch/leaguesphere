MATCHREPORT_GAMEDAY_LIST = "matchreport-gameday-list"
MATCHREPORT_GAMEDAY_LEAGUE_STATISTICS = "matchreport-gameday-statistics"
MATCHREPORT_GAMEDAY_LIST_AND_YEAR = "matchreport-gameday-list-and-year"
MATCHREPORT_GAMEDAY_LIST_AND_YEAR_AND_LEAGUE = (
    "matchreport-gameday-list-and-year-and-league"
)
MATCHREPORT_GAMEDAY_DETAIL = "matchreport-gameday-detail"
MATCHREPORT_GAMEDAY_PASSCHECK_DOWNLOAD = "matchreport-gameday-passcheck-download"
MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD = "matchreport-gameday-list-csv-download"
MATCHREPORT_GAMEDAY_LIST_CSV_DOWNLOAD_AND_LEAGUE = (
    "matchreport-gameday-list-csv-download-and-league"
)

# Shared pandas .to_html() kwargs for every rendered report table (gameday
# detail's passcheck/officials/flags tables). Extracted so other apps that
# reuse MachtreportModelWrapper.get_gameday_match_report() directly (e.g.
# officials/service/officiated_games_service.py) render with identical
# styling instead of drifting from a second copy of this dict.
REPORT_TABLE_RENDER_CONFIG = {
    "index": False,
    "classes": [
        "table",
        "table-hover",
        "table-condensed",
        "table-responsive",
        "text-center",
    ],
    "border": 0,
    "justify": "center",
    "escape": False,
    "table_id": "schedule",
    # Several columns (officials Lizenz/Lizenznummer) use None to mean an
    # intentionally blank cell. Without an explicit na_rep, pandas'
    # to_html() default turns that into the literal text "NaN" (or, when a
    # whole column is None, the literal word "None") - render both as an
    # actual blank cell instead.
    "na_rep": "",
}
