from django.db import models


class Verband(models.Model):
    """Sportverband (Mandant). Regelwerk, Formulare und Import-Adapter hängen am Verband."""

    SPORTARTEN = [('handball', 'Handball')]

    kuerzel = models.CharField('Kürzel', max_length=20, unique=True)
    name = models.CharField(max_length=120)
    sportart = models.CharField(max_length=20, choices=SPORTARTEN, default='handball')
    aktiv = models.BooleanField('zur Auswahl anbieten', default=True)
    reihenfolge = models.PositiveIntegerField(default=100)

    class Meta:
        verbose_name = 'Verband'
        verbose_name_plural = 'Verbände'
        ordering = ['reihenfolge', 'name']

    def __str__(self) -> str:
        return self.name

    def aktives_regelwerk(self, saison: str | None = None) -> 'RulePack | None':
        qs = self.regelwerke.filter(aktiv=True)
        if saison:
            passend = qs.filter(saison=saison).order_by('-id').first()
            if passend:
                return passend
        return qs.order_by('-saison', '-id').first()


class RulePack(models.Model):
    """Versioniertes Regelwerk (Spesensätze, Zuschläge, Fristen) als JSON – ohne Codeänderung anpassbar."""

    verband = models.ForeignKey(Verband, on_delete=models.CASCADE, related_name='regelwerke')
    saison = models.CharField(max_length=9)
    version = models.CharField(max_length=40)
    daten = models.JSONField()
    aktiv = models.BooleanField(default=True)
    erstellt = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Regelwerk'
        verbose_name_plural = 'Regelwerke'
        unique_together = [('verband', 'saison', 'version')]

    def __str__(self) -> str:
        return f'{self.verband.kuerzel} {self.saison} ({self.version})'
