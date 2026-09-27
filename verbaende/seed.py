"""Stammdaten, die nach jedem migrate idempotent angelegt werden."""

import json
from pathlib import Path

RULEPACK_DIR = Path(__file__).resolve().parent.parent / 'schiedsrichter' / 'data' / 'rulepacks'

# Handball-Landesverbände im DHB – zur Auswahl angeboten werden nur die freigeschalteten
FREIGESCHALTET = {'HVS'}

HANDBALL_VERBAENDE = [
    ('HVS', 'Handball-Verband Saar e.V.'),
    ('BHV', 'Badischer Handball-Verband'),
    ('SHV', 'Südbadischer Handball-Verband'),
    ('HVW', 'Handballverband Württemberg'),
    ('BHV-BY', 'Bayerischer Handball-Verband'),
    ('HHV', 'Hessischer Handball-Verband'),
    ('PfHV', 'Pfälzer Handball-Verband'),
    ('HVR', 'Handball-Verband Rheinland'),
    ('HVRh', 'Handballverband Rheinhessen'),
    ('HVM', 'Handball-Verband Mittelrhein'),
    ('HVN', 'Handball-Verband Niederrhein'),
    ('HVW-WF', 'Handballverband Westfalen'),
    ('HVNie', 'Handball-Verband Niedersachsen'),
    ('BHV-HB', 'Bremer Handball-Verband'),
    ('HHV-HH', 'Hamburger Handball-Verband'),
    ('HVSH', 'Handballverband Schleswig-Holstein'),
    ('HVMV', 'Handballverband Mecklenburg-Vorpommern'),
    ('HVB', 'Handball-Verband Berlin'),
    ('HVBB', 'Handball-Verband Brandenburg'),
    ('HVSA', 'Handball-Verband Sachsen-Anhalt'),
    ('HVS-SN', 'Handball-Verband Sachsen'),
    ('THV', 'Thüringer Handball-Verband'),
]

WAFFLE_FLAGS = [
    # name, note, everyone, authenticated, superusers, percent
    ('pdf_official_bogen', 'Offizieller HVS-Vordruck „Reisekostenabrechnung“ als Quittungs-PDF', True, False, False, None),
    ('import_webcal', 'Kalender-Import per Webcal-URL (zusätzlich zur ICS-Datei)', None, True, False, None),
    ('reports_csv_export', 'CSV-Export der Saisonabrechnung (Excel/Steuer)', None, True, False, None),
    ('club_module_spielerplus', 'Vereinsmodul „SpielerPlus“ (Phase 3) – Pilotvereine', None, False, True, None),
]


def seed_stammdaten(**kwargs) -> None:
    from .models import RulePack, Verband

    for i, (kuerzel, name) in enumerate(HANDBALL_VERBAENDE):
        Verband.objects.get_or_create(kuerzel=kuerzel, defaults={'name': name, 'reihenfolge': i, 'aktiv': kuerzel in FREIGESCHALTET})

    for path in sorted(RULEPACK_DIR.glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        verband = Verband.objects.filter(kuerzel=data['association']).first()
        if not verband:
            continue
        pack, created = RulePack.objects.get_or_create(
            verband=verband, saison=data['season'], version=data['version'], defaults={'daten': data}
        )
        if created:
            RulePack.objects.filter(verband=verband, saison=data['season']).exclude(pk=pack.pk).update(aktiv=False)

    try:
        from waffle.models import Flag
    except ImportError:
        return
    for name, note, everyone, authenticated, superusers, percent in WAFFLE_FLAGS:
        Flag.objects.get_or_create(
            name=name,
            defaults={
                'note': note,
                'everyone': everyone,
                'authenticated': authenticated,
                'superusers': superusers,
                'percent': percent,
            },
        )
