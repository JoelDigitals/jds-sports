from django.conf import settings
from django.db import models


class Assignment(models.Model):
    """Ein Schiedsrichter-Einsatz (Ansetzung) – importiert aus nuLiga/handball.net/Handball360 oder manuell."""

    STATUS = [
        ('angesetzt', 'Angesetzt'),
        ('bestätigt', 'Bestätigt'),
        ('verlegt', 'Verlegt'),
        ('abgesagt', 'Abgesagt'),
        ('ausgefallen_angereist', 'Ausgefallen (angereist)'),
        ('ausgefallen_nicht_angereist', 'Ausgefallen (nicht angereist)'),
        ('geleitet', 'Geleitet'),
    ]
    ROLLEN = [
        ('sr1', 'Schiedsrichter 1'),
        ('sr2', 'Schiedsrichter 2'),
        ('esr', 'Einzelschiedsrichter'),
        ('zns', 'Zeitnehmer/Sekretär'),
    ]
    WETTBEWERBE = [
        ('championship', 'Meisterschaft'),
        ('cup', 'Pokal'),
        ('friendly', 'Freundschaftsspiel'),
        ('tournament', 'Turnier'),
    ]
    QUELLEN = [
        ('manual', 'Manuell'),
        ('nuliga', 'nuLiga'),
        ('handballnet', 'handball.net'),
        ('handball360', 'Handball360'),
        ('file', 'Datei'),
    ]
    OHNE_SPESEN = ('abgesagt', 'ausgefallen_nicht_angereist')

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='einsaetze')
    source = models.CharField('Quelle', max_length=20, choices=QUELLEN, default='manual')
    source_uid = models.CharField(max_length=200, blank=True, null=True)
    sequence = models.IntegerField(default=0)
    last_modified = models.CharField(max_length=40, blank=True, null=True)

    spielnummer = models.CharField('Spiel-Nr.', max_length=40, blank=True, help_text='z. B. 2627SAROLCJMA0501')
    game_datetime = models.DateTimeField('Datum & Uhrzeit')
    home_team = models.CharField('Heim', max_length=160)
    away_team = models.CharField('Gast', max_length=160, blank=True)
    league = models.CharField('Liga (Anzeige)', max_length=200)
    league_key = models.CharField('Spielklasse (Regelwerk)', max_length=60, blank=True, null=True)
    competition_type = models.CharField('Wettbewerb', max_length=20, choices=WETTBEWERBE, default='championship')
    cup_round = models.CharField('Pokalrunde', max_length=30, blank=True, null=True)
    tournament_group = models.CharField('Turnier-Art', max_length=40, blank=True, null=True)
    tournament_tier = models.CharField('Staffel (Spielzeit)', max_length=40, blank=True, null=True)
    games_count = models.PositiveIntegerField('Anzahl Spiele', default=1)
    hall = models.CharField('Halle', max_length=200, blank=True)
    hallennummer = models.CharField('Hallen-Nr. (optional)', max_length=20, blank=True, help_text='Wird automatisch aus früheren Spielen in dieser Halle übernommen. Ist sie gesetzt, steht sie statt des Hallennamens auf dem Bogen.')
    hall_address = models.CharField('Hallenadresse', max_length=300, blank=True)
    role = models.CharField('Rolle', max_length=3, choices=ROLLEN, default='sr1')
    status = models.CharField(max_length=30, choices=STATUS, default='angesetzt')
    notes = models.TextField('Notizen', blank=True)

    travel_km = models.FloatField('Fahrt-km (Hin + Rück)', blank=True, null=True)
    travel_km_manual = models.BooleanField('km-Wert manuell (nicht aufteilen)', default=False)
    travel_km_auto = models.BooleanField(default=False, help_text='km wurden automatisch berechnet')
    travel_minutes = models.FloatField(blank=True, null=True, help_text='Fahrzeit einfach (Minuten)')
    km_fehler = models.CharField(max_length=200, blank=True, help_text='Letzter Fehler der automatischen km-Berechnung')
    travel_mitfahrer = models.BooleanField('Mitfahrt im Gespann (0,32 €/km)', default=False)
    pnv_cost = models.DecimalField('PNV-Einzelfahrtkosten (€)', max_digits=8, decimal_places=2, blank=True, null=True)
    other_cost = models.DecimalField('Sonstige Auslagen (€)', max_digits=8, decimal_places=2, blank=True, null=True)

    # Ergebnis der Spesen-Engine (Cache, wird bei jeder Änderung neu berechnet)
    expense_total = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    expense_breakdown = models.JSONField(default=list, blank=True)
    expense_warnings = models.JSONField(default=list, blank=True)
    rulepack_version = models.CharField(max_length=40, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Einsatz'
        verbose_name_plural = 'Einsätze'
        ordering = ['-game_datetime']
        constraints = [
            models.UniqueConstraint(fields=['user', 'source', 'source_uid'], name='uniq_einsatz_quelle'),
        ]
        indexes = [models.Index(fields=['user', 'game_datetime'])]

    def __str__(self) -> str:
        return f'{self.game_datetime:%d.%m.%Y} {self.home_team} – {self.away_team}'

    @property
    def begegnung(self) -> str:
        return f'{self.home_team} – {self.away_team}' if self.away_team else self.home_team

    @property
    def hat_spesen(self) -> bool:
        return self.status not in self.OHNE_SPESEN


class Receipt(models.Model):
    """Quittung = ausgefüllter HVS-Abrechnungsbogen für genau ein Spiel (bleibt beim jeweiligen Heimverein)."""

    AUSZAHLUNG = [
        ('offen', 'offen'),
        ('erhalten', 'erhalten'),
        ('nicht_ausgezahlt', 'nicht ausgezahlt'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='quittungen')
    assignments = models.ManyToManyField(Assignment, related_name='quittungen')
    season = models.CharField(max_length=9)
    total = models.DecimalField(max_digits=8, decimal_places=2)
    pdf = models.FileField(upload_to='quittungen/', blank=True)
    payout_status = models.CharField('Auszahlung', max_length=20, choices=AUSZAHLUNG, default='offen')
    payout_date = models.DateField('ausgezahlt am', blank=True, null=True)
    payer = models.CharField('ausgezahlt von', max_length=120, blank=True)
    automatisch = models.BooleanField(default=False, help_text='3 Tage vor dem Spiel automatisch erstellt')
    pdf_stand = models.CharField(max_length=64, blank=True, help_text='Fingerabdruck der Daten, aus denen das PDF erzeugt wurde')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Quittung'
        verbose_name_plural = 'Quittungen'
        ordering = ['-created_at', '-id']

    def __str__(self) -> str:
        return f'Quittung Nr. {self.pk}'


class Halle(models.Model):
    """Hallen-Verzeichnis: wird aus den Einsätzen automatisch aufgebaut und merkt sich die Hallennummer.

    Die Nummer stammt immer aus dem zuletzt gespielten Spiel, bei dem eine Nummer eingetragen war.
    """

    name = models.CharField(max_length=200)
    name_key = models.CharField(max_length=200, db_index=True, blank=True)
    adresse = models.CharField(max_length=300, blank=True)
    adresse_key = models.CharField(max_length=300, db_index=True, blank=True)
    nummer = models.CharField('Hallen-Nr.', max_length=20, blank=True)
    nummer_stand = models.DateTimeField('Nummer zuletzt gesehen am (Spiel)', blank=True, null=True)
    erstellt = models.DateTimeField(auto_now_add=True)
    aktualisiert = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Halle'
        verbose_name_plural = 'Hallen'
        ordering = ['name']

    def __str__(self) -> str:
        return f'{self.name} ({self.nummer})' if self.nummer else self.name


class GeoCache(models.Model):
    query = models.CharField(max_length=300, primary_key=True)
    lat = models.FloatField(null=True)
    lon = models.FloatField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class RouteCache(models.Model):
    key = models.CharField(max_length=100, primary_key=True)
    meters = models.FloatField()
    seconds = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
