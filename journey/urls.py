from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import JourneyEventViewSet, JourneyViewSet, JourneyDashboardView
from .api.creation_stats import GameCreationStatsViewSet

router = DefaultRouter()
router.register(r'events', JourneyEventViewSet, basename='event')
router.register(r'journeys', JourneyViewSet, basename='journey')
router.register(r'gameday-creation-stats', GameCreationStatsViewSet, basename='gameday-creation-stats')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', JourneyDashboardView.as_view(), name='journey-dashboard'),
]
