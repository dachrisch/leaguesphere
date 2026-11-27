"""The account name is the join key between a ledger row and a MySQL account.

One person used to own one deterministic account (``dbeaver_prod_<handle>``),
so the reaper could not tell which request a session belonged to. These tests
pin the replacement: one account per request row, still under 32 characters,
still under the ``dbeaver_prod_`` prefix the reaper matches.

No database is needed for this file: the naming is a pure function and the
migration imports the very same function, so a drift here would be caught by
the migration tests as well.
"""

import pytest

from dbaccess.accounts import (
    ACCOUNT_MAX_LENGTH,
    ACCOUNT_PREFIX,
    base36,
    db_user_for,
    is_legacy_db_user,
)


@pytest.mark.parametrize("request_id", [1, 15, 36, 12345, 2**63 - 1])
def test_the_reaper_prefix_survives_for_every_request_id(request_id):
    assert db_user_for("5eradmin", request_id).startswith(ACCOUNT_PREFIX)


def test_the_id_is_appended_as_base36_after_an_explicit_request_marker():
    # 15 -> 'f' in base36; the marker makes the suffix readable in an account
    # list and keeps it distinct from the handle.
    assert db_user_for("5eradmin", 15) == "dbeaver_prod_5eradmin_rf"
    assert db_user_for("chrisd", 36) == "dbeaver_prod_chrisd_r10"


def test_base36_refuses_negative_ids():
    # A request id is an auto-field primary key; a negative one is a caller bug,
    # not a name to mint. Guard the branch the sidecar relies on.
    with pytest.raises(ValueError, match="non-negative"):
        base36(-1)


def test_base36_is_injective_over_the_whole_bigautofield_range():
    # No hash: the full primary key is encoded, so two requests can never
    # produce the same suffix - not even at the 64-bit ceiling.
    assert base36(1) == "1"
    assert base36(36) == "10"
    assert base36(12345) == "9ix"
    assert base36(2**63 - 1) == "1y2p0ij32e8e7"

    seen = {base36(n) for n in range(0, 2000)}
    assert len(seen) == 2000


def test_an_account_always_fits_the_32_character_limit():
    # The handle gives way to the id, never the other way round: the id is the
    # key that makes the name unique.
    for handle, request_id in (
        ("a" * 60, 1),
        ("a" * 60, 12345),
        ("a" * 60, 2**63 - 1),
        ("", 2**63 - 1),
    ):
        user = db_user_for(handle, request_id)

        assert len(user) <= ACCOUNT_MAX_LENGTH, (handle, request_id, user)


def test_even_the_largest_id_leaves_a_readable_handle():
    # 13 prefix + 2 marker + 13 base36 digits = 28, so at least four handle
    # characters remain across the whole signed-64-bit primary key range.
    user = db_user_for("chrisd", 2**63 - 1)

    assert len(user.split("_r")[-1]) == 13
    assert len(user) - len(ACCOUNT_PREFIX) - len("_r") - 13 >= 4
    assert user.startswith("dbeaver_prod_chri")


def test_two_requests_by_the_same_person_never_get_the_same_account():
    first = db_user_for("5eradmin", 14)
    second = db_user_for("5eradmin", 15)

    assert first != second
    assert first.endswith("_re")  # base36(14) == 'e'
    assert second.endswith("_rf")


def test_a_truncated_handle_still_cannot_collide_two_requests():
    # Long handles that share a prefix used to be the same account; the id
    # suffix disambiguates them even when truncation eats the distinguishing
    # tail of the handle.
    one = db_user_for("a" * 60 + "x", 100)
    two = db_user_for("a" * 60 + "y", 101)

    assert one != two
    assert one.rsplit("_r", 1)[0] == two.rsplit("_r", 1)[0]


def test_the_name_is_deterministic_across_calls():
    assert db_user_for("5eradmin", 401) == db_user_for("5eradmin", 401)


def test_the_name_only_contains_sql_safe_characters():
    import re

    for person in ("Müller", "5erAdmin", "first-last_99", "___", "a" * 60):
        assert re.fullmatch(
            r"dbeaver_prod_[a-z0-9]*_r[0-9a-z]+", db_user_for(person, 7)
        )


def test_old_deterministic_names_are_recognised_for_the_migration():
    assert is_legacy_db_user("dbeaver_prod_5eradmin")
    assert is_legacy_db_user("dbeaver_prod_chrisd")
    assert not is_legacy_db_user("dbeaver_prod_5eradmin_rf")
    assert not is_legacy_db_user(None)
    assert not is_legacy_db_user("")
