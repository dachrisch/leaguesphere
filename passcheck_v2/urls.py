from django.urls import path

from passcheck_v2.views import PasscheckV2View, ServiceWorkerView

PASSCHECK_V2_APP = "passcheck-v2-app"
PASSCHECK_V2_SERVICE_WORKER = "passcheck-v2-service-worker"

urlpatterns = [
    path("", PasscheckV2View.as_view(), name=PASSCHECK_V2_APP),
    path("sw.js", ServiceWorkerView.as_view(), name=PASSCHECK_V2_SERVICE_WORKER),
]
