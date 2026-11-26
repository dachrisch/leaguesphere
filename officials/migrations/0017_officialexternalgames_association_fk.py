from django.db import migrations, models
import django.db.models.deletion

# Frozen snapshot of officials.service.association_resolution.ASSOCIATION_ALIASES
# at the time of this migration. Do NOT import the live service here: a future
# edit to the resolver or the live alias map must not silently change what this
# historical migration does when it is replayed from scratch.
ASSOCIATION_ALIASES = {
    "AFCVTH": "AFCVT",
    "Spielverbund Nord": "AFCVNORD",
    "Ausland": "OHNE",
    "Scrimmage": "OHNE",
    "Natio": "OHNE",
}
_ALIASES_CASEFOLDED = {
    alias.casefold(): target for alias, target in ASSOCIATION_ALIASES.items()
}

_BATCH_SIZE = 1000


class UnknownAssociationError(ValueError):
    """A stored value has no match in the frozen mapping - abort the migration."""


def _resolve_distinct(values, Association):
    """Resolve each distinct stored string to an association pk, exactly once.

    Same order and case rules as the service (exact abbr, case-insensitive
    alias, case-insensitive name), but against the historical model supplied by
    ``apps.get_model`` and with the frozen alias snapshot above.
    """
    resolved = {}
    for value in values:
        normalized = (value or "").strip()
        if not normalized:
            raise UnknownAssociationError(f"Unbekannter Verband: {value}")

        association = Association.objects.filter(abbr=normalized).first()
        if association is None:
            alias = _ALIASES_CASEFOLDED.get(normalized.casefold())
            if alias is not None:
                association = Association.objects.filter(abbr=alias).first()
        if association is None:
            matches = list(Association.objects.filter(name__iexact=normalized))
            if len(matches) > 1:
                raise UnknownAssociationError(
                    f"Mehrdeutiger Verband: {value} - mehrere Verbände mit diesem "
                    "Namen vorhanden! Bitte eindeutige Abkürzung verwenden."
                )
            if matches:
                association = matches[0]
        if association is None:
            raise UnknownAssociationError(f"Unbekannter Verband: {value}")
        resolved[value] = association.pk
    return resolved


def forwards(apps, schema_editor):
    """Map every stored free-text value onto the existing association rows.

    All 21 distinct values in production are covered by the frozen snapshot
    above; an unmapped value aborts the migration rather than writing NULL or
    inventing a row. Each distinct string is resolved once and rows are updated
    in batches, instead of three SELECTs plus a save() per row (~24k queries
    for the 6,083-row dump).

    Values are de-duplicated in Python, not with SQL DISTINCT: on MySQL's
    case-insensitive collation the latter would collapse case variants and
    leave rows whose exact string was never resolved.
    """
    OfficialExternalGames = apps.get_model("officials", "OfficialExternalGames")
    Association = apps.get_model("gamedays", "Association")

    distinct_values = set(
        OfficialExternalGames.objects.values_list("association", flat=True)
    )
    resolved = _resolve_distinct(distinct_values, Association)

    batch = []
    for row in OfficialExternalGames.objects.all().only("pk", "association").iterator():
        row.association_new_id = resolved[row.association]
        batch.append(row)
        if len(batch) >= _BATCH_SIZE:
            OfficialExternalGames.objects.bulk_update(batch, ["association_new"])
            batch = []
    if batch:
        OfficialExternalGames.objects.bulk_update(batch, ["association_new"])


def backwards(apps, schema_editor):
    """Write the canonical abbreviation back into the varchar column that
    RemoveField re-creates just before this runs.

    NOTE: the reverse is lossy. Five production strings had no association row
    of their own and were aliased onto an existing one during the forward
    migration, so reversing writes the canonical abbreviation (e.g. ``AFCVT``)
    instead of the original free text (e.g. ``AFCVTH``). The original strings
    are not stored anywhere and cannot be reconstructed from the FK alone.
    """
    OfficialExternalGames = apps.get_model("officials", "OfficialExternalGames")
    for row in OfficialExternalGames.objects.select_related(
        "association_new"
    ).iterator():
        row.association = row.association_new.abbr
        row.save(update_fields=["association"])


class Migration(migrations.Migration):

    dependencies = [
        ("officials", "0016_crewposition"),
        ("gamedays", "0048_gamesetup_quarterbacks"),
    ]

    operations = [
        migrations.AddField(
            model_name="officialexternalgames",
            name="association_new",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="gamedays.association",
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name="officialexternalgames",
            name="association",
        ),
        migrations.RenameField(
            model_name="officialexternalgames",
            old_name="association_new",
            new_name="association",
        ),
        migrations.AlterField(
            model_name="officialexternalgames",
            name="association",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                to="gamedays.association",
            ),
        ),
    ]
