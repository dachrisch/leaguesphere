# Generated migration for optimizing database indexes
# Removes wasteful indexes with primary key first, adds corrected indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("officials", "0013_alter_official_team"),
    ]

    operations = [
        # ===== OFFICIAL MODEL =====
        # Remove: Index(["id", "team"]) — actual name from migration 0009
        migrations.RemoveIndex(
            model_name="official",
            name="officials_o_id_f573ca_idx",
        ),
        # Add: Index(["team"])
        migrations.AddIndex(
            model_name="official",
            index=models.Index(fields=["team"], name="officials_official_team_idx"),
        ),
        # Remove: Index(["id", "association"]) — actual name from migration 0009
        migrations.RemoveIndex(
            model_name="official",
            name="officials_o_id_72c331_idx",
        ),
        # Add: Index(["association"])
        migrations.AddIndex(
            model_name="official",
            index=models.Index(
                fields=["association"], name="officials_official_association_idx"
            ),
        ),
    ]
