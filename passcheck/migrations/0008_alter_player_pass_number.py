# Generated by Django 5.0.4 on 2025-01-31 13:38

import django.core.validators
import re
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('passcheck', '0007_playerlisttransfer_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='pass_number',
            field=models.CharField(max_length=20, validators=[django.core.validators.RegexValidator(re.compile('^-?\\d+\\Z'), code='invalid', message='Enter a valid integer.')]),
        ),
    ]
