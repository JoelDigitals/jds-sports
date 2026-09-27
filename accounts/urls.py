from django.contrib.auth import views as auth_views
from django.urls import path, reverse_lazy

from . import views
from .forms import NeuesPasswortForm, PasswortAendernForm, PasswortVergessenForm

urlpatterns = [
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('registrieren/', views.registrieren, name='registrieren'),
    path('einstellungen/', views.einstellungen, name='einstellungen'),

    # Passwort vergessen → E-Mail mit Link (Versand über Mailjet)
    path('passwort-vergessen/', auth_views.PasswordResetView.as_view(
        template_name='accounts/passwort_vergessen.html',
        form_class=PasswortVergessenForm,
        subject_template_name='accounts/email/passwort_reset_betreff.txt',
        email_template_name='accounts/email/passwort_reset.txt',
        html_email_template_name='accounts/email/passwort_reset.html',
        success_url=reverse_lazy('password_reset_done'),
    ), name='password_reset'),
    path('passwort-vergessen/gesendet/', auth_views.PasswordResetDoneView.as_view(
        template_name='accounts/passwort_vergessen_gesendet.html',
    ), name='password_reset_done'),
    path('passwort-zuruecksetzen/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='accounts/passwort_neu.html',
        form_class=NeuesPasswortForm,
        success_url=reverse_lazy('password_reset_complete'),
    ), name='password_reset_confirm'),
    path('passwort-zuruecksetzen/fertig/', auth_views.PasswordResetCompleteView.as_view(
        template_name='accounts/passwort_neu_fertig.html',
    ), name='password_reset_complete'),

    # Passwort ändern (angemeldet)
    path('einstellungen/passwort/', views.PasswortAendernView.as_view(form_class=PasswortAendernForm), name='password_change'),
]
