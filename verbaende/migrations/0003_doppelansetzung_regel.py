from django.db import migrations

NOTE = (
    'DB 2026/27 Ziff. 7.2.8: Doppelansetzungen (Spiele direkt hintereinander in derselben Halle). '
    'Umsetzung: Zuschlag je zusätzlichem Spiel, anteilig auf alle Spiele verteilt (2 Spiele: 2,50 € + 2,50 €); '
    'Fahrt-km ebenfalls anteilig. Spiele in anderen Hallen oder mit mehr als maxAbstandMinuten zwischen den Anpfiffen '
    'werden normal abgerechnet (volle Hin- und Rückfahrt, keine Pauschale)'
)


def aktualisieren(apps, schema_editor):
    RulePack = apps.get_model('verbaende', 'RulePack')
    for pack in RulePack.objects.filter(verband__kuerzel='HVS'):
        bonus = pack.daten.setdefault('doubleBonus', {})
        bonus.setdefault('maxAbstandMinuten', 180)
        bonus['note'] = NOTE
        pack.save(update_fields=['daten'])


class Migration(migrations.Migration):
    dependencies = [('verbaende', '0002_nur_hvs_aktiv')]
    operations = [migrations.RunPython(aktualisieren, migrations.RunPython.noop)]
