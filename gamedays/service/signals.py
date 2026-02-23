from django.db.models.signals import post_save
from django.dispatch import receiver

from gamedays.service.schedule_resolution_service import GamedayScheduleResolutionService
from gamedays.models import Gameinfo

FINISHED = "beendet"


@receiver(post_save, sender=Gameinfo)
def update_game_schedule(sender, instance: Gameinfo, created, **kwargs):
    if instance.status == FINISHED:
        resolution_service = GamedayScheduleResolutionService(instance.gameday_id)
        # Check if the standing or stage that just finished is now fully completed
        if resolution_service.gmw.is_finished(instance.standing):
            resolution_service.update_participants(instance.standing)
        if resolution_service.gmw.is_finished(instance.stage):
            resolution_service.update_participants(instance.stage)
