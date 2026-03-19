from django.urls import path
from django.views.generic import RedirectView
from .views import (
    FinanceDashboardView,
    FinanceConfigDetailView,
    ConfigCreateView,
    ConfigDeleteView,
    DiscountDeleteView,
    GlobalSettingsUpdateView
)

urlpatterns = [
    path('', RedirectView.as_view(pattern_name='finance-dashboard', permanent=True)),
    path('dashboard/', FinanceDashboardView.as_view(), name='finance-dashboard'),
    path('config/add/', ConfigCreateView.as_view(), name='finance-config-add'),
    path('config/<int:pk>/', FinanceConfigDetailView.as_view(), name='finance-config-detail'),
    path('config/<int:pk>/delete/', ConfigDeleteView.as_view(), name='finance-config-delete'),
    path('discount/<int:pk>/delete/', DiscountDeleteView.as_view(), name='finance-discount-delete'),
    path('settings/', GlobalSettingsUpdateView.as_view(), name='finance-settings'),
]
