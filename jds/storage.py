import logging

from django.core.files.storage import FileSystemStorage
from whitenoise.storage import CompressedManifestStaticFilesStorage

logger = logging.getLogger(__name__)


class RobusterStaticStorage(CompressedManifestStaticFilesStorage):
    """Wie WhiteNoise-Standard (versionierte, komprimierte Dateien), aber ohne 500er, wenn collectstatic fehlt.

    Fehlt eine Datei in STATIC_ROOT (z. B. Build-Befehl ohne collectstatic), wird die normale Adresse
    /static/… verwendet – WhiteNoise liefert sie dank WHITENOISE_USE_FINDERS direkt aus static/ aus.
    """

    manifest_strict = False

    def url(self, name, force=False):
        try:
            return super().url(name, force)
        except ValueError:
            logger.warning('Statische Datei %s fehlt in STATIC_ROOT – collectstatic im Build ausführen (bash build.sh)', name)
            return FileSystemStorage.url(self, name)  # einfache Adresse /static/<name>, ohne Hash
