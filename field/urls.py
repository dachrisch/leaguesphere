from django.urls import path

from field.views import FieldView

FIELD_APP = "field-app"

urlpatterns = [
    path("", FieldView.as_view(), name=FIELD_APP),
]
