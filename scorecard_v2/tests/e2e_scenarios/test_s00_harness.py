"""S00 — can the rest of the run be trusted?

Three checks: two browsers are two independent devices, going offline affects
only the phone that asked, and a SIGKILL really kills the process while the
profile (and therefore the device id) survives the restart.
"""

import pytest

pytestmark = pytest.mark.django_db(transaction=True)


def test_s00_browsers_are_independent_devices(phones, club_game):
    a, b = phones

    assert a.pids(), "phone A has no browser process"
    assert b.pids(), "phone B has no browser process"
    assert set(a.pids()).isdisjoint(b.pids())

    assert a.device_id() != b.device_id()


def test_s00_offline_cuts_only_that_phone(phones, club_game):
    a, b = phones

    a.offline()

    assert a.fetch_status("/api/config/scorecard/penalties") == "failed"
    assert b.fetch_status("/api/config/scorecard/penalties") == 200


def test_s00_kill_is_real_and_restart_keeps_the_device(phones, club_game):
    a, _ = phones
    device = a.device_id()

    a.kill()
    assert a.pids() == []

    a.restart()
    a.open_root()
    assert a.device_id() == device
