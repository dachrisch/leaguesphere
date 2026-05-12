from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .progress_views import GameProgressViewSet

router = DefaultRouter()
router.register(r'', GameProgressViewSet, basename='game-progress')

urlpatterns = [
    path('', include(router.urls)),
]
