"""What the sidecar is allowed to hand out.

The temporary account used to get `SELECT ON <db>.*`, so the curated list only
bounded what could be *requested*: `auth_user`, `django_session`, the OAuth2
bearer tokens and `dbaccess_request.secret` (the plaintext credential of a
session nobody had revealed yet) were all readable regardless. These assertions
pin the narrower grant so the two halves cannot drift apart again.
"""

import pathlib
import re
import subprocess

SIDECAR = pathlib.Path(__file__).resolve().parents[2] / "deployed" / "dba" / "tick.sh"


def _script() -> str:
    return SIDECAR.read_text()


def test_the_sidecar_never_grants_on_the_whole_schema():
    assert "GRANT SELECT ON `${DB}`.*" not in _script()


def test_reads_come_from_the_curated_allow_list():
    from dbaccess.models import GrantableTable

    script = _script()

    # the exact table Django writes; `dbaccess_grantable_table` (one underscore
    # more) does not exist and would have failed every mint
    assert f"FROM {GrantableTable._meta.db_table}" in script
    assert "WHERE grantable=1" in script
    assert "GRANT SELECT ON \\`%s\\`.\\`%s\\`" in script


def test_the_snapshot_table_is_readable_so_the_runbook_step_works():
    assert "bak_%s_%s" in _script()


def test_the_account_keeps_its_connection_caps():
    script = _script()

    assert "MAX_STATEMENT_TIME 60" in script
    assert "MAX_USER_CONNECTIONS 4" in script


def _privileges_for(may_insert: int, may_delete: int) -> str:
    """Run the sidecar's own `privileges_for`, so the shell is the real code.

    Reimplementing the list in Python would pass while the shell went on
    granting something else - the drift this file exists to prevent.
    """
    script = _script()
    start = script.index("privileges_for() {")
    end = script.index("# --- end privilege set ---")

    body = f"{script[start:end]}\nprivileges_for {may_insert} {may_delete}\n"
    result = subprocess.run(
        ["sh", "-c", body], capture_output=True, text=True, check=True
    )

    return result.stdout.strip()


def test_the_default_grant_stays_select_and_update_only():
    assert _privileges_for(0, 0) == "SELECT, UPDATE"


def test_insert_is_added_only_when_the_request_asks_for_it():
    assert _privileges_for(1, 0) == "SELECT, UPDATE, INSERT"


def test_delete_is_added_only_when_the_request_asks_for_it():
    assert _privileges_for(0, 1) == "SELECT, UPDATE, DELETE"


def test_both_extra_privileges_can_be_requested_together():
    assert _privileges_for(1, 1) == "SELECT, UPDATE, INSERT, DELETE"


def test_an_empty_or_bogus_flag_never_widens_the_grant():
    """A NULL from an older row must read as "not granted", not as "granted"."""
    assert _privileges_for("", "") == "SELECT, UPDATE"
    assert _privileges_for("yes", "2") == "SELECT, UPDATE"


def test_the_read_only_allow_list_tables_never_get_a_write_privilege():
    """INSERT/DELETE belong to the requested tables, never to the read list."""
    script = _script()

    # The read loop is one hard-coded SELECT and does not consult the flags.
    assert "GRANT SELECT ON \\`%s\\`.\\`%s\\`" in script
    read_loop = script[
        script.index("read_tables=$(sql") : script.index('if [ -z "$read_tables" ]')
    ]
    assert "INSERT" not in read_loop
    assert "DELETE" not in read_loop


def test_the_write_flags_are_read_with_a_safe_default():
    """A tick that runs before the app migration must not fail on a missing column.

    COALESCE alone does not help against an unknown column, so the select is
    built only after `information_schema` says both columns exist; otherwise it
    reads two literal zeros.
    """
    script = _script()

    assert "COALESCE(may_insert,0)" in script
    assert "COALESCE(may_delete,0)" in script
    assert "information_schema.columns" in script
    assert "column_name IN ('may_insert','may_delete')" in script
    assert 'write_columns="0, 0"' in script


def _grant_failure_reason(may_delete: int, error: str = "ERROR 1142") -> str:
    script = _script()
    start = script.index("grant_failure_reason() {")
    end = script.index("# --- end grant failure reason ---")

    body = f"{script[start:end]}\ngrant_failure_reason {may_delete} '{error}'\n"
    result = subprocess.run(
        ["sh", "-c", body], capture_output=True, text=True, check=True
    )

    return result.stdout.strip()


def test_a_failed_delete_grant_names_the_missing_provisioner_privilege():
    """Without DELETE on the provisioner every DELETE grant fails with 1142.

    The request must be parked as `failed` with that reason - a half-minted
    account holding INSERT but not DELETE would be worse than no account.
    """
    reason = _grant_failure_reason(1)

    assert "DELETE" in reason
    assert "provisioner" in reason.lower()
    assert "ERROR 1142" in reason


def test_any_other_grant_failure_keeps_the_generic_reason():
    reason = _grant_failure_reason(0)

    assert "could not create the account" in reason
    assert "ERROR 1142" in reason


def test_a_non_delete_error_with_delete_ticked_is_not_blamed_on_the_provisioner():
    """Only the DELETE-denied errors get the "run the role" hint."""
    reason = _grant_failure_reason(1, "ERROR 1045 access denied")

    assert "could not create the account" in reason
    assert "run the ls.dbeaver role" not in reason


def _person_check() -> re.Pattern:
    """The pattern the sidecar applies to a row's `person` before minting."""
    match = re.search(r"printf '%s' \"\$person\" \| grep -Eq '([^']+)'", _script())

    assert (
        match
    ), "the sidecar no longer validates `person` in a form this test can read"
    return re.compile(match.group(1))


def test_every_handle_the_app_derives_passes_the_sidecars_person_check():
    """The two halves must agree on the alphabet, or every mint is parked.

    `access_handle()` derives the name the sidecar creates; when the sidecar is
    stricter than the derivation, the request is approved and *then* fails, and
    the person who approved it has spent their decision on nothing.
    """
    from dbaccess.models import access_handle

    pattern = _person_check()
    for login in ("chrisd", "5erAdmin", "Müller", "first-last_99", "a" * 60):
        handle = access_handle(login)

        assert handle, login
        assert pattern.fullmatch(
            handle
        ), f"{login!r} derives the handle {handle!r}, which the sidecar refuses"


def _table_check() -> re.Pattern:
    """The identifier guard the sidecar applies to every requested table."""
    match = re.search(r"^VALID_ID='([^']+)'$", _script(), re.M)

    assert match, "the sidecar no longer declares VALID_ID in a form this test can read"
    return re.compile(match.group(1))


def test_the_sidecar_accepts_the_mixed_case_names_the_allow_list_seeds():
    """`dbaccess_sync_tables` seeds table names verbatim from information_schema.

    Production has exactly three mixed-case ones - `Gameinfo`,
    `Gesamttabelle_2022_sortiert`, `Strafen` - and the guard demanded a
    lowercase first letter, so a request naming any of them failed *whole*,
    after approval, with "table name is not a plain identifier". The GRANT is
    backticked, so the case carries no injection risk.
    """
    pattern = _table_check()

    for name in (
        "Gameinfo",
        "Gesamttabelle_2022_sortiert",
        "Strafen",
        "divisions",
        "wpdatatable_3",
        "officials_officialexternalgames",
    ):
        assert pattern.fullmatch(name), name


def test_the_sidecar_still_refuses_a_table_name_that_is_not_an_identifier():
    """Case is allowed now; everything the backticks cannot contain stays out."""
    pattern = _table_check()

    for name in (
        "x`",
        "x'y",
        'x"y',
        "x; DROP TABLE t",
        "x y",
        "x\n",
        "-x",
        "a" * 65,
        "",
    ):
        assert not pattern.fullmatch(name), name


def _snapshot_names(tables, today="20261113") -> list[str]:
    """Run the sidecar's own `snapshot_for` under sh, so the logic is real code.

    Extracted between its markers rather than reimplemented: a Python copy of
    the naming would pass while the shell went on building a name the server
    refuses.
    """
    script = _script()
    start = script.index("snapshot_for() {")
    end = script.index("# --- end snapshot naming")

    body = f"today={today}\n{script[start:end]}\n"
    body += "\n".join(f'snapshot_for "{t}"' for t in tables) + "\n"
    result = subprocess.run(
        ["sh", "-c", body], capture_output=True, text=True, check=True
    )

    return result.stdout.split()


def test_a_snapshot_name_always_fits_the_identifier_limit():
    """MariaDB caps an identifier at 64 bytes and says 1103 beyond that.

    `bak_league_table_leagueseasonconfig_leagues_for_league_points_20261113` is
    70, so that table could never be snapshotted - and a request naming it was
    parked as `failed` after approval, with every other table in the request
    collateral damage.
    """
    long_names = [
        "league_table_leagueseasonconfig_leagues_for_league_points",
        "league_table_leagueseasonconfig_exclude_gamedays",
    ]

    for name in _snapshot_names(long_names):
        assert len(name) <= 64, name
        assert name.startswith("bak_"), name
        assert name.endswith("_20261113"), name


def test_a_snapshot_of_a_short_name_keeps_the_runbook_form():
    """The runbook says `SELECT COUNT(*) FROM bak_<table>_<date>`; keep it true."""
    assert _snapshot_names(["divisions", "Gameinfo"]) == [
        "bak_divisions_20261113",
        "bak_Gameinfo_20261113",
    ]


def test_a_snapshot_name_stays_specific_when_the_table_name_is_truncated():
    """Truncation alone would merge two long names that share a prefix."""
    first, second = _snapshot_names(
        [
            "league_table_leagueseasonconfig_leagues_for_league_points",
            "league_table_leagueseasonconfig_leagues_for_league_standings",
        ]
    )

    assert first != second


def test_the_snapshot_name_is_stable_across_ticks():
    """`CREATE TABLE IF NOT EXISTS` reuses it, so it must not drift per run."""
    table = "league_table_leagueseasonconfig_leagues_for_league_points"

    assert _snapshot_names([table]) == _snapshot_names([table])
