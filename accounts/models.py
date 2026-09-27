from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError('E-Mail-Adresse fehlt')
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    """Anmeldung per E-Mail. Jeder Nutzer gehört zu einem Verband und hat eine oder mehrere Rollen."""

    SR_ROLLEN = [
        ('sr1', 'Schiedsrichter 1'),
        ('sr2', 'Schiedsrichter 2'),
        ('esr', 'Einzelschiedsrichter'),
        ('zns', 'Zeitnehmer/Sekretär'),
    ]

    username = None
    email = models.EmailField('E-Mail', unique=True)

    verband = models.ForeignKey('verbaende.Verband', on_delete=models.PROTECT, null=True, related_name='mitglieder')
    saison = models.CharField(max_length=9, default='2026/27')
    verein = models.CharField(max_length=120, blank=True)

    # Rollen = sichtbare Bereiche im Dashboard
    ist_schiedsrichter = models.BooleanField('Schiedsrichter/in', default=False)
    ist_spieler = models.BooleanField('Spieler/in', default=False)
    ist_trainer = models.BooleanField('Trainer/in', default=False)
    ist_funktionaer = models.BooleanField('Vereins-/Verbandsfunktionär/in', default=False)

    strasse = models.CharField('Straße', max_length=120, blank=True)
    plz = models.CharField('PLZ', max_length=10, blank=True)
    ort = models.CharField(max_length=80, blank=True)
    telefon = models.CharField(max_length=40, blank=True)
    iban = models.CharField('IBAN', max_length=40, blank=True)

    # Schiedsrichter-spezifisch
    standard_rolle = models.CharField('Standard-SR-Rolle', max_length=3, choices=SR_ROLLEN, default='sr1')
    partner_name = models.CharField('Gespannpartner/in (Name, Vorname)', max_length=120, blank=True)
    partner_adresse = models.CharField('Adresse Gespannpartner/in', max_length=200, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = UserManager()

    class Meta:
        verbose_name = 'Benutzer'
        verbose_name_plural = 'Benutzer'

    def __str__(self) -> str:
        return self.get_full_name() or self.email

    @property
    def heimadresse(self) -> str:
        return ', '.join(p for p in [self.strasse.strip(), f'{self.plz} {self.ort}'.strip()] if p)
