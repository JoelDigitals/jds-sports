from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.urls import reverse

from .forms import LoginForm, ProfilForm, RegistrierungForm


class PasswortAendernView(auth_views.PasswordChangeView):
    template_name = 'accounts/passwort_aendern.html'

    def get_success_url(self):
        messages.success(self.request, 'Passwort geändert.')
        return reverse('einstellungen')


class LoginView(auth_views.LoginView):
    template_name = 'accounts/login.html'
    authentication_form = LoginForm
    redirect_authenticated_user = True


def registrieren(request):
    if request.user.is_authenticated:
        return redirect('hub:dashboard')
    form = RegistrierungForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        messages.success(request, f'Willkommen bei JDS Sports, {user.first_name}!')
        return redirect('hub:dashboard')
    return render(request, 'accounts/registrieren.html', {'form': form})


@login_required
def einstellungen(request):
    alte_adresse = request.user.heimadresse
    form = ProfilForm(request.POST or None, instance=request.user)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        from schiedsrichter.services import automatik
        from schiedsrichter.services.assignments import recalc_user

        recalc_user(user)
        messages.success(request, 'Einstellungen gespeichert.')
        if user.heimadresse != alte_adresse:
            automatik.adresse_geaendert(user)
            messages.info(request, 'Neue Adresse: Die Fahrt-km aller Einsätze werden automatisch neu berechnet.')
        return redirect('einstellungen')
    return render(request, 'accounts/einstellungen.html', {'form': form})
