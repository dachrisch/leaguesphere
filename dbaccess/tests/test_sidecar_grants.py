"""What the sidecar is allowed to hand out.

The temporary account used to get `SELECT ON <db>.*`, so the curated list only
bounded what could be *requested*: `auth_user`, `django_session`, the OAuth2
bearer tokens and `dbaccess_request.secret` (the plaintext credential of a
session nobody had revealed yet) were all readable regardless. These assertions
pin the narrower grant so the two halves cannot drift apart again.
"""

import pathlib

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
