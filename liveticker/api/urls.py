from django.urls import path

from liveticker.api.views import LivetickerAPIView
from liveticker.stream.views import liveticker_stream

API_LIVETICKER_ALL = "api-liveticker"
API_LIVETICKER_STREAM = "api-liveticker-stream"

urlpatterns = [
    path("", LivetickerAPIView.as_view(), name=API_LIVETICKER_ALL),
    path("stream/", liveticker_stream, name=API_LIVETICKER_STREAM),
]
