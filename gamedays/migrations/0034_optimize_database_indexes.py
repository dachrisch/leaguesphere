# Generated migration for optimizing database indexes
# Removes wasteful indexes with primary key first, adds corrected indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gamedays", "0033_alter_team_location"),
    ]

    operations = [
        # ===== GAMEDAY MODEL =====
        # Remove: Index(["id", "date"])
        migrations.RemoveIndex(
            model_name="gameday",
            name="gamedays_gameday_id_date_idx",
        ),
        # Add: Index(["date"])
        migrations.AddIndex(
            model_name="gameday",
            index=models.Index(fields=["date"], name="gamedays_gameday_date_idx"),
        ),
        # ===== GAMEINFO MODEL =====
        # Remove: Index(["id", "officials"])
        migrations.RemoveIndex(
            model_name="gameinfo",
            name="gamedays_gameinfo_id_officials_idx",
        ),
        # Add: Index(["officials"])
        migrations.AddIndex(
            model_name="gameinfo",
            index=models.Index(
                fields=["officials"], name="gamedays_gameinfo_officials_idx"
            ),
        ),
        # Remove: Index(["id", "gameday"])
        migrations.RemoveIndex(
            model_name="gameinfo",
            name="gamedays_gameinfo_id_gameday_idx",
        ),
        # Add: Index(["gameday"])
        migrations.AddIndex(
            model_name="gameinfo",
            index=models.Index(fields=["gameday"], name="gamedays_gameinfo_gameday_idx"),
        ),
        # ===== GAMERESULT MODEL =====
        # Remove: Index(["id", "gameinfo", "isHome"])
        migrations.RemoveIndex(
            model_name="gameresult",
            name="gamedays_gameresult_id_gameinfo_ishome_idx",
        ),
        # Add: Index(["gameinfo", "isHome"])
        migrations.AddIndex(
            model_name="gameresult",
            index=models.Index(
                fields=["gameinfo", "isHome"],
                name="gamedays_gameresult_gameinfo_ishome_idx",
            ),
        ),
        # Remove: Index(["id", "gameinfo"])
        migrations.RemoveIndex(
            model_name="gameresult",
            name="gamedays_gameresult_id_gameinfo_idx",
        ),
        # Add: Index(["gameinfo"])
        migrations.AddIndex(
            model_name="gameresult",
            index=models.Index(
                fields=["gameinfo"], name="gamedays_gameresult_gameinfo_idx"
            ),
        ),
        # Remove: Index(["id", "team"])
        migrations.RemoveIndex(
            model_name="gameresult",
            name="gamedays_gameresult_id_team_idx",
        ),
        # Add: Index(["team"])
        migrations.AddIndex(
            model_name="gameresult",
            index=models.Index(fields=["team"], name="gamedays_gameresult_team_idx"),
        ),
    ]
