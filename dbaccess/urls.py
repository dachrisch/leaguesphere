from django.urls import path

from dbaccess import views

urlpatterns = [
    path("", views.index, name="dbaccess-index"),
    path("requests/", views.RequestListView.as_view(), name="dbaccess-list"),
    path("requests/new/", views.RequestCreateView.as_view(), name="dbaccess-create"),
    path("requests/<int:pk>/", views.RequestDetailView.as_view(), name="dbaccess-detail"),
    path("requests/<int:pk>/decide/", views.DecideView.as_view(), name="dbaccess-decide"),
    path("requests/<int:pk>/reveal/", views.RevealView.as_view(), name="dbaccess-reveal"),
    path("requests/<int:pk>/revoke/", views.RevokeView.as_view(), name="dbaccess-revoke"),
]
