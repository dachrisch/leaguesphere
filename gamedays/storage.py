import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PassPhotoStorage(FileSystemStorage):
    """Private storage for consent-gated pass photos.

    The location is read from settings on every access (not cached at import),
    so tests can point ``PASS_PHOTO_ROOT`` at a temporary directory. There is
    deliberately no base URL: photos are only reachable through the
    permission-checked API view, never through ``/media/``.
    """

    @property
    def base_location(self):
        return settings.PASS_PHOTO_ROOT

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    @property
    def base_url(self):
        return None


def pass_photo_storage():
    return PassPhotoStorage()
