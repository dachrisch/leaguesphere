"""Give every ledger row its own MySQL account name.

Before this migration one person's whole history shared
``dbeaver_prod_<handle>``, so a session could not be attributed to a request.
The reaper's live-state filter already stops old rows from killing a live
session, but two live requests by the same person still share an account - the
2026-11-27 incident.

Live rows are deliberately NOT renamed here: their MySQL account still carries
the old name, and renaming only the ledger would make the reaper treat a live
session as orphaned and kill it at the next sweep. Those rows are finalised by
``manage.py dbaccess_finalize_db_users`` after the last in-flight session has
been reaped. Terminal rows (including the dropped rows from past incidents)
have no account left and are backfilled immediately.
"""

from django.db import migrations, models

from dbaccess.accounts import NEW_ACCOUNT_RE, access_handle, db_user_for

# Rows that may still have a live MySQL account at rollout time.
LIVE_STATES = ("approved", "active", "revoke_requested", "expired")
MIGRATION_EVENT = "db_user-migrated"


def _backfill(apps, row, new_name, old_name):
    AccessEvent = apps.get_model("dbaccess", "AccessEvent")
    row.db_user = new_name
    row.save(update_fields=["db_user"])
    AccessEvent.objects.create(
        request_id=row.pk,
        actor="migration",
        action=MIGRATION_EVENT,
        detail=f"{old_name or '(none)'} -> {new_name}",
    )


def forwards(apps, schema_editor):
    AccessRequest = apps.get_model("dbaccess", "AccessRequest")

    for row in AccessRequest.objects.all().iterator():
        new_name = db_user_for(row.person, row.pk)
        if row.db_user == new_name:
            continue
        if row.state in LIVE_STATES and row.db_user:
            # Still in flight: keep the name the running account was minted
            # with. The finalise command takes it after the drop.
            continue
        _backfill(apps, row, new_name, row.db_user)


def backwards(apps, schema_editor):
    AccessRequest = apps.get_model("dbaccess", "AccessRequest")

    for row in AccessRequest.objects.all().iterator():
        if not row.db_user or not NEW_ACCOUNT_RE.fullmatch(row.db_user):
            continue
        old_name = "dbeaver_prod_" + access_handle(row.person)
        row.db_user = old_name
        row.save(update_fields=["db_user"])
    # The forward migration's events are left in place: they are an audit
    # trail, not state a reverse migration should quietly erase.


class Migration(migrations.Migration):

    dependencies = [
        ("dbaccess", "0002_accessrequest_insert_delete"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
        migrations.AlterField(
            model_name="accessrequest",
            name="person",
            field=models.CharField(
                help_text="Login this request belongs to; the account also carries its request id",
                max_length=21,
            ),
        ),
    ]
