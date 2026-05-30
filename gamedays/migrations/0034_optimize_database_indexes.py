# Generated migration for optimizing database indexes
# Removes wasteful indexes with primary key first, adds corrected indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gamedays", "0033_alter_team_location"),
    ]

    operations = [
        # ===== GAMEDAY MODEL =====
        # Remove: Index(["id", "date"]) — actual name from migration 0018
        migrations.RemoveIndex(
            model_name="gameday",
            name="gamedays_ga_id_167c15_idx",
        ),
        # Add: Index(["date"])
        migrations.AddIndex(
            model_name="gameday",
            index=models.Index(fields=["date"], name="gamedays_gameday_date_idx"),
        ),
        # ===== GAMEINFO MODEL =====
        # Remove: Index(["id", "officials"]) — actual name from migration 0018
        migrations.RemoveIndex(
            model_name="gameinfo",
            name="gamedays_ga_id_5c5d8e_idx",
        ),
        # Add: Index(["officials"])
        migrations.AddIndex(
            model_name="gameinfo",
            index=models.Index(
                fields=["officials"], name="gamedays_gameinfo_officials_idx"
            ),
        ),
        # Remove: Index(["id", "gameday"]) — actual name from migration 0018
        migrations.RemoveIndex(
            model_name="gameinfo",
            name="gamedays_ga_id_26afd5_idx",
        ),
        # Add: Index(["gameday"])
        migrations.AddIndex(
            model_name="gameinfo",
            index=models.Index(fields=["gameday"], name="gamedays_gameinfo_gameday_idx"),
        ),
        # ===== GAMERESULT MODEL =====
        # Remove: Index(["id", "gameinfo", "isHome"]) — actual name from migration 0018
        migrations.RemoveIndex(
            model_name="gameresult",
            name="gamedays_ga_id_e28311_idx",
        ),
        # Add: Index(["gameinfo", "isHome"])
        migrations.AddIndex(
            model_name="gameresult",
            index=models.Index(
                fields=["gameinfo", "isHome"],
                name="gamedays_gameresult_gameinfo_ishome_idx",
            ),
        ),
        # Remove: Index(["id", "gameinfo"]) — actual name from migration 0018
        migrations.RemoveIndex(
            model_name="gameresult",
            name="gamedays_ga_id_55dc8c_idx",
        ),
        # Add: Index(["gameinfo"])
        migrations.AddIndex(
            model_name="gameresult",
            index=models.Index(
                fields=["gameinfo"], name="gamedays_gameresult_gameinfo_idx"
            ),
        ),
        # Remove: Index(["id", "team"]) — actual name from migration 0018
        migrations.RemoveIndex(
            model_name="gameresult",
            name="gamedays_ga_id_f40410_idx",
        ),
        # Add: Index(["team"])
        migrations.AddIndex(
            model_name="gameresult",
            index=models.Index(fields=["team"], name="gamedays_gameresult_team_idx"),
        ),
    ]
