from django.urls import path

from field.views import FieldView, ServiceWorkerView

FIELD_APP = "field-app"
FIELD_SERVICE_WORKER = "field-service-worker"

urlpatterns = [
    path("", FieldView.as_view(), name=FIELD_APP),
    path("sw.js", ServiceWorkerView.as_view(), name=FIELD_SERVICE_WORKER),
]
