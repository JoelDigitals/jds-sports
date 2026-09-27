from django.urls import path

from . import views

app_name = 'hub'

urlpatterns = [
    path('', views.start, name='start'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('bereich/<slug:key>/', views.modul, name='modul'),
]
