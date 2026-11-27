import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from gamedays.models import Gameinfo
from gamedays.service import schedule_strategies

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Gameinfo)
def update_game_schedule(sender, instance: Gameinfo, created, **kwargs):
    if instance.status == Gameinfo.STATUS_COMPLETED:
        # Ordered strategies (designer template → canvas → legacy) own the
        # resolution and its failure logging. See schedule_strategies.py.
        schedule_strategies.resolve(instance)
