from django.urls import path

from share.views import ShareGeneratorView, ShareWidgetView

urlpatterns = [
    path("", ShareGeneratorView.as_view(), name="share-generator"),
    path("widget/", ShareWidgetView.as_view(), name="share-widget"),
]
