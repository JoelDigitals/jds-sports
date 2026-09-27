from django.db import migrations


def nur_hvs(apps, schema_editor):
    """Vorerst wird nur der Handball-Verband Saar angeboten; andere Verbände bleiben angelegt, aber inaktiv."""
    Verband = apps.get_model('verbaende', 'Verband')
    Verband.objects.exclude(kuerzel='HVS').update(aktiv=False)


class Migration(migrations.Migration):
    dependencies = [('verbaende', '0001_initial')]
    operations = [migrations.RunPython(nur_hvs, migrations.RunPython.noop)]
