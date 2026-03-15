from django.urls import path
from .views import (
    FinanceDashboardView, 
    FinanceConfigDetailView, 
    DiscountCreateView, 
    DiscountDeleteView,
    GlobalSettingsUpdateView
)

urlpatterns = [
    path('dashboard/', FinanceDashboardView.as_view(), name='finance-dashboard'),
    path('config/<int:pk>/', FinanceConfigDetailView.as_view(), name='finance-config-detail'),
    path('config/<int:config_id>/discount/add/', DiscountCreateView.as_view(), name='finance-discount-add'),
    path('discount/<int:pk>/delete/', DiscountDeleteView.as_view(), name='finance-discount-delete'),
    path('settings/', GlobalSettingsUpdateView.as_view(), name='finance-settings'),
]
