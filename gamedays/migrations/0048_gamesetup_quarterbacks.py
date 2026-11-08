from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gamedays", "0047_alter_gamelogsubmission_created_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="gamesetup",
            name="qbHome",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="gamesetup",
            name="qbAway",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
