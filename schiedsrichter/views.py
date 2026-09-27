import csv
from collections import defaultdict
from urllib.parse import quote

import waffle
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST

from .forms import AssignmentForm, ImportForm, PayoutForm
from .models import Assignment, Receipt
from .services import automatik, hallen, importer, reports
from .services.assignments import recalc_user
from .services.receipts import QuittungFehler, aktualisieren, create_receipt, create_receipts, regenerate
from .services.rules import class_name, hat_eigenes_regelwerk, pack_for_user
from .services.travel import auto_fill_km


def sr_bereich(view):
    """Schiedsrichter-Bereich: aktuell für alle angemeldeten Nutzer."""
    return login_required(view)


def _pflegen(request) -> dict:
    """Automatik bei jedem Aufruf der Übersichten: Spiele abschließen, fehlende km berechnen."""
    res = automatik.pflegen(request.user)
    if res['abgeschlossen']:
        messages.info(request, f"{res['abgeschlossen']} vergangene(s) Spiel(e) automatisch als geleitet markiert.")
    for r in res['quittungen']:
        spiele = ', '.join(a.begegnung for a in r.assignments.all())
        messages.success(request, f'Abrechnungsbogen bereit: Quittung Nr. {r.pk} für {spiele}.')
    return res


@sr_bereich
def dashboard(request):
    auto = _pflegen(request)
    return render(request, 'schiedsrichter/dashboard.html', {
        'auto': auto,
        'd': reports.dashboard(request.user),
        'eigenes_regelwerk': hat_eigenes_regelwerk(request.user),
    })


@sr_bereich
def einsaetze(request):
    auto = _pflegen(request)
    qs = Assignment.objects.filter(user=request.user).prefetch_related('quittungen').order_by('-game_datetime')
    status, monat = request.GET.get('status', ''), request.GET.get('monat', '')
    if status:
        qs = qs.filter(status=status)
    if monat:
        try:
            y, m = map(int, monat.split('-'))
            qs = qs.filter(game_datetime__year=y, game_datetime__month=m)
        except ValueError:
            pass
    tage = defaultdict(list)
    for a in qs:
        tage[a.game_datetime.date()].append(a)
    gruppen = [
        {'datum': d, 'einsaetze': sorted(lst, key=lambda a: a.game_datetime), 'summe': sum(float(a.expense_total or 0) for a in lst)}
        for d, lst in tage.items()
    ]
    return render(request, 'schiedsrichter/einsaetze.html', {
        'gruppen': gruppen, 'status': status, 'monat': monat, 'status_choices': Assignment.STATUS, 'auto': auto,
        'ohne_adresse': not request.user.heimadresse,
    })


@sr_bereich
def einsatz(request, pk=None):
    user = request.user
    obj = get_object_or_404(Assignment, pk=pk, user=user) if pk else None
    pack = pack_for_user(user)
    before = (obj.hall, obj.hall_address, obj.travel_km) if obj else None
    form = AssignmentForm(request.POST or None, instance=obj, pack=pack,
                          initial=None if obj else {'role': user.standard_rolle, 'status': 'angesetzt'})

    if request.method == 'POST':
        aktion = request.POST.get('aktion', 'speichern')
        if aktion == 'loeschen' and obj:
            obj.delete()
            recalc_user(user)
            messages.success(request, 'Einsatz gelöscht.')
            return redirect('sr:einsaetze')
        if form.is_valid():
            a = form.save(commit=False)
            a.user = user
            if not a.league:
                a.league = class_name(pack, a.league_key) or 'Unbekannte Liga'
            if before and a.travel_km != before[2]:
                a.travel_km_auto = False  # von Hand eingetragen → nicht mehr automatisch überschreiben
            if before and (a.hall, a.hall_address) != before[:2]:
                a.km_fehler = ''
            a.save()
            # Halle im Verzeichnis anlegen/erkennen: Nummer lernen oder aus früheren Spielen übernehmen,
            # dann andere Spiele in derselben Halle ohne Nummer ergänzen
            hallen.erkennen(a)
            hallen.alle_erkennen(Assignment.objects.filter(user=user, hallennummer=''))
            recalc_user(user)
            hall_changed = bool(before) and (a.hall, a.hall_address) != before[:2]
            if aktion == 'km' or a.travel_km is None or (hall_changed and a.travel_km_auto):
                res = auto_fill_km(a, force=aktion == 'km' or hall_changed)
                if res.fehler:
                    messages.warning(request, f'km konnten nicht berechnet werden: {res.fehler}')
                elif aktion == 'km' or res.km != (before[2] if before else None):
                    messages.info(request, f'{res.km:g} km (Hin + Rück, ca. {res.minutes:g} min je Richtung) · {res.von} → {res.nach}')
            if aktion == 'quittung':
                return _quittung_erstellen(request, [a.pk])
            messages.success(request, 'Gespeichert. Spesen wurden neu berechnet.')
            return redirect('sr:einsatz', pk=a.pk)

    if obj:
        obj.refresh_from_db()
    return render(request, 'schiedsrichter/einsatz.html', {
        'form': form, 'obj': obj, 'pack': pack,
        'quittung': obj.quittungen.first() if obj else None,
    })


def _quittung_erstellen(request, ids):
    try:
        r = create_receipt(request.user, ids)
    except QuittungFehler as e:
        messages.error(request, str(e))
        return redirect(request.META.get('HTTP_REFERER') or 'sr:einsaetze')
    messages.success(request, f'Quittung Nr. {r.pk} erstellt – Abrechnungsbogen als PDF bereit.')
    return redirect(f"{reverse('sr:quittungen')}?neu={r.pk}")


@require_POST
@sr_bereich
def quittung_neu(request):
    """Ausgewählte Spiele → je Spiel eine Quittung."""
    ids = [int(i) for i in request.POST.getlist('ids') if i.isdigit()]
    if len(ids) == 1:
        return _quittung_erstellen(request, ids)
    erstellt, fehler = create_receipts(request.user, ids)
    for f in fehler:
        messages.error(request, f)
    if erstellt:
        messages.success(request, f'{len(erstellt)} Quittung(en) erstellt – je Spiel eine: Nr. ' + ', '.join(str(r.pk) for r in erstellt))
    return redirect('sr:quittungen')


@sr_bereich
def import_view(request):
    form = ImportForm(request.POST or None, request.FILES or None)
    if request.method == 'POST' and form.is_valid():
        source = form.cleaned_data['source']
        try:
            if form.cleaned_data['datei']:
                text = form.cleaned_data['datei'].read().decode('utf-8-sig', errors='replace')
            else:
                if not waffle.flag_is_active(request, 'import_webcal'):
                    raise importer.ImportFehler('Kalender-Abonnement (Webcal) ist aktuell nicht freigeschaltet – bitte ICS-Datei verwenden.')
                text = importer.fetch_webcal(form.cleaned_data['webcal_url'])
                if source == 'nuliga':
                    source = 'handballnet'
            analyse = importer.analyze(request.user, text, source)
        except importer.ImportFehler as e:
            form.add_error(None, str(e))
        else:
            request.session['import_analyse'] = analyse
            return redirect('sr:import_pruefen')
    return render(request, 'schiedsrichter/import.html', {'form': form})


@sr_bereich
def import_pruefen(request):
    analyse = request.session.get('import_analyse')
    if not analyse:
        return redirect('sr:import')
    if request.method == 'POST':
        auswahl = {int(i) for i in request.POST.getlist('auswahl') if i.isdigit()}
        drafts = [item['draft'] for idx, item in enumerate(analyse['items']) if idx in auswahl]
        if not drafts:
            messages.warning(request, 'Keine Einsätze ausgewählt.')
            return redirect('sr:import_pruefen')
        created, updated = importer.apply(request.user, analyse['source'], drafts)
        del request.session['import_analyse']
        messages.success(request, f'Import abgeschlossen: {created} neu, {updated} aktualisiert.')
        return redirect('sr:einsaetze')  # km berechnet die Einsatzliste automatisch im Hintergrund
    pack = pack_for_user(request.user)
    for item in analyse['items']:
        item['draft']['klasse'] = class_name(pack, item['draft']['league_key'])
    return render(request, 'schiedsrichter/import_pruefen.html', {'a': analyse})


@sr_bereich
def quittungen(request):
    pack = pack_for_user(request.user)
    liste = list(Receipt.objects.filter(user=request.user).prefetch_related('assignments'))
    user = request.user
    for r in liste:
        spiele = list(r.assignments.order_by('game_datetime'))
        r.spiele = spiele
        r.form = PayoutForm(instance=r, prefix=f'r{r.pk}')
        erstes = spiele[0] if spiele else None
        text = (
            f'Sehr geehrte Damen und Herren,\n\nfür meine Quittung Nr. {r.pk} über {r.total:.2f} EUR'
            + (f' (Spiel {erstes.spielnummer or ""} am {erstes.game_datetime:%d.%m.%Y}: {erstes.begegnung})' if erstes else '')
            + ' ist bisher keine Auszahlung erfolgt.\n\n'
            + f'Bankverbindung: {user.iban or "[IBAN]"}\n\nMit freundlichen Grüßen\n{user.get_full_name()}'
        )
        r.mailto = (
            f"mailto:{pack['deadlines']['nonPaymentEmail']}?subject={quote(f'Nichtauszahlung Schiedsrichterspesen – Quittung Nr. {r.pk}')}"
            f'&body={quote(text)}'
        )
    return render(request, 'schiedsrichter/quittungen.html', {
        'quittungen': liste, 'neu': request.GET.get('neu'), 'frist_tage': pack['deadlines']['nonPaymentDays'],
        'email': pack['deadlines']['nonPaymentEmail'],
    })


@require_POST
@sr_bereich
def quittung_auszahlung(request, pk):
    r = get_object_or_404(Receipt, pk=pk, user=request.user)
    form = PayoutForm(request.POST, instance=r, prefix=f'r{r.pk}')
    if form.is_valid():
        form.save()
        messages.success(request, f'Auszahlungsstatus von Quittung Nr. {r.pk} gespeichert.')
        n = automatik.bei_auszahlung(r)
        if n:
            messages.info(request, f'{n} Spiel(e) automatisch als geleitet markiert.')
    else:
        messages.error(request, 'Bitte Eingaben prüfen.')
    return redirect('sr:quittungen')


@require_POST
@sr_bereich
def quittung_neu_erzeugen(request, pk):
    r = get_object_or_404(Receipt, pk=pk, user=request.user)
    regenerate(r)
    messages.success(request, f'PDF von Quittung Nr. {r.pk} neu erzeugt.')
    return redirect('sr:quittungen')


@require_POST
@sr_bereich
def quittung_loeschen(request, pk):
    r = get_object_or_404(Receipt, pk=pk, user=request.user)
    if r.pdf:
        r.pdf.delete(save=False)
    r.delete()
    messages.success(request, f'Quittung Nr. {pk} gelöscht.')
    return redirect('sr:quittungen')


@sr_bereich
def quittung_pdf(request, pk):
    r = get_object_or_404(Receipt, pk=pk, user=request.user)
    aktualisieren(r)  # neu erzeugen, falls sich km, Spiel- oder Profildaten seit dem letzten PDF geändert haben
    # Komplett einlesen statt streamen: Datei ist sofort wieder frei (Windows sperrt offene Dateien beim Löschen)
    with r.pdf.open('rb') as f:
        data = f.read()
    response = HttpResponse(data, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Abrechnung_Quittung_{r.pk}.pdf"'
    return response


@require_POST
@sr_bereich
def quittung_vorbereiten(request, pk):
    """Dashboard: Bogen für ein anstehendes Spiel öffnen (vorhandene Quittung) oder erstellen."""
    vorhanden = Receipt.objects.filter(user=request.user, assignments__pk=pk).first()
    if vorhanden:
        return redirect('sr:quittung_pdf', pk=vorhanden.pk)
    try:
        r = create_receipt(request.user, [pk])
    except QuittungFehler as e:
        messages.error(request, str(e))
        return redirect('sr:dashboard')
    return redirect('sr:quittung_pdf', pk=r.pk)


@sr_bereich
def auswertung(request):
    return render(request, 'schiedsrichter/auswertung.html', {
        'z': reports.zusammenfassung(request.user),
        'csv_erlaubt': waffle.flag_is_active(request, 'reports_csv_export'),
    })


@sr_bereich
def export_csv(request):
    if not waffle.flag_is_active(request, 'reports_csv_export'):
        raise Http404('CSV-Export ist nicht freigeschaltet (Feature-Flag).')
    user = request.user
    pack = pack_for_user(user)
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="jds-sports-abrechnung-{user.saison.replace("/", "-")}.csv"'
    response.write('﻿')
    w = csv.writer(response, delimiter=';', quoting=csv.QUOTE_ALL)
    w.writerow(['Datum', 'Uhrzeit', 'Spiel-Nr.', 'Wettbewerb', 'Spielklasse', 'Heim', 'Gast', 'Halle', 'Rolle', 'Status',
                'Entschädigung (EUR)', 'Wochentagszuschlag (EUR)', 'Doppelansetzung (EUR)', 'Fahrtkosten (EUR)', 'Fahrt-km',
                'Gesamt (EUR)', 'Quittung', 'Auszahlung', 'Regelwerk'])
    fmt = lambda n: f'{n:.2f}'.replace('.', ',')  # noqa: E731
    for a in reports.in_saison(user).order_by('game_datetime').prefetch_related('quittungen'):
        amt = lambda k: next((i['amount'] for i in a.expense_breakdown if i['key'] == k), 0)  # noqa: E731
        q = a.quittungen.first()
        w.writerow([
            a.game_datetime.strftime('%d.%m.%Y'), a.game_datetime.strftime('%H:%M'), a.spielnummer,
            a.get_competition_type_display(), a.league, a.home_team, a.away_team, a.hall, a.get_role_display(),
            a.get_status_display(), fmt(amt('base')), fmt(amt('weekday')), fmt(amt('double')), fmt(amt('travel')),
            f'{a.travel_km:g}'.replace('.', ',') if a.travel_km else '', fmt(float(a.expense_total or 0)),
            f'Nr. {q.pk}' if q else '', q.get_payout_status_display() if q else '', pack['version'],
        ])
    return response
