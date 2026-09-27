from django.urls import path

from . import views

app_name = 'sr'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('einsaetze/', views.einsaetze, name='einsaetze'),
    path('einsaetze/neu/', views.einsatz, name='einsatz_neu'),
    path('einsaetze/<int:pk>/', views.einsatz, name='einsatz'),
    path('import/', views.import_view, name='import'),
    path('import/pruefen/', views.import_pruefen, name='import_pruefen'),
    path('quittungen/', views.quittungen, name='quittungen'),
    path('quittungen/neu/', views.quittung_neu, name='quittung_neu'),
    path('quittungen/vorbereiten/<int:pk>/', views.quittung_vorbereiten, name='quittung_vorbereiten'),
    path('quittungen/<int:pk>/pdf/', views.quittung_pdf, name='quittung_pdf'),
    path('quittungen/<int:pk>/auszahlung/', views.quittung_auszahlung, name='quittung_auszahlung'),
    path('quittungen/<int:pk>/neu-erzeugen/', views.quittung_neu_erzeugen, name='quittung_neu_erzeugen'),
    path('quittungen/<int:pk>/loeschen/', views.quittung_loeschen, name='quittung_loeschen'),
    path('auswertung/', views.auswertung, name='auswertung'),
    path('auswertung/export.csv', views.export_csv, name='export_csv'),
]
