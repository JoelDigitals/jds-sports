from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import redirect, render

from .modules import MODULE_BY_KEY, module_fuer


def start(request):
    return redirect('hub:dashboard' if request.user.is_authenticated else 'login')


@login_required
def dashboard(request):
    meine, weitere = module_fuer(request.user)
    from schiedsrichter.services import automatik
    from schiedsrichter.services.reports import kurzuebersicht

    automatik.pflegen(request.user)
    kennzahlen = {'schiedsrichter': kurzuebersicht(request.user)}
    return render(request, 'hub/dashboard.html', {'meine': meine, 'weitere': weitere, 'kennzahlen': kennzahlen})


@login_required
def modul(request, key: str):
    m = MODULE_BY_KEY.get(key)
    if not m:
        raise Http404
    return redirect(m.url_name)
