from django.db import migrations


def aufteilen(apps, schema_editor):
    """Sammelquittungen (mehrere Spiele) in je eine Quittung pro Spiel aufteilen – Auszahlungsstatus bleibt erhalten."""
    Receipt = apps.get_model('schiedsrichter', 'Receipt')
    for r in Receipt.objects.all():
        spiele = list(r.assignments.order_by('game_datetime'))
        if len(spiele) <= 1:
            continue
        erstes, rest = spiele[0], spiele[1:]
        r.assignments.set([erstes])
        r.total = erstes.expense_total or 0
        r.pdf_stand = ''  # PDF wird beim nächsten Öffnen neu erzeugt
        r.save()
        for a in rest:
            neu = Receipt.objects.create(
                user_id=r.user_id, season=r.season, total=a.expense_total or 0, payout_status=r.payout_status,
                payout_date=r.payout_date, payer=r.payer, automatisch=r.automatisch,
            )
            neu.assignments.set([a])


class Migration(migrations.Migration):
    dependencies = [('schiedsrichter', '0004_hallennummer')]
    operations = [migrations.RunPython(aufteilen, migrations.RunPython.noop)]
