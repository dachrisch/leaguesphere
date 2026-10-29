from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("gamedays", "0046_gamelogsubmission_device_lock"),
        ("gameevents", "0004_gameevent_author"),
    ]

    operations = [
        migrations.AddField(
            model_name="gameevent",
            name="team_log",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="gamedays.teamlog",
            ),
        ),
    ]
