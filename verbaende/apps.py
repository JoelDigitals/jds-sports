from django.apps import AppConfig
from django.db.models.signals import post_migrate


class VerbaendeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'verbaende'
    verbose_name = 'Verbände & Regelwerke'

    def ready(self) -> None:
        from .seed import seed_stammdaten

        post_migrate.connect(seed_stammdaten, sender=self)
