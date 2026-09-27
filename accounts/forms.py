from django import forms
from django.contrib.auth.forms import (
    AuthenticationForm,
    PasswordChangeForm,
    PasswordResetForm,
    SetPasswordForm,
    UserCreationForm,
)

from jds.forms import StyledFormMixin
from verbaende.models import Verband

from .models import User


class VerbandChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, obj: Verband) -> str:
        return f'{obj.name} ({obj.kuerzel})'


class VerbandFestMixin:
    """Solange nur ein Verband freigeschaltet ist (aktuell HV Saar), wird er fest gesetzt statt ausgewählt."""

    def _verband_festlegen(self):
        aktive = list(Verband.objects.filter(aktiv=True)[:2])
        self.einziger_verband = aktive[0] if len(aktive) == 1 else None
        if self.einziger_verband:
            feld = self.fields['verband']
            feld.widget = forms.HiddenInput()
            feld.initial = self.einziger_verband.pk
            feld.disabled = True  # Wert kommt immer aus initial, nicht aus dem Formular


class RegistrierungForm(StyledFormMixin, VerbandFestMixin, UserCreationForm):
    verband = VerbandChoiceField(
        queryset=Verband.objects.filter(aktiv=True),
        empty_label='– Verband auswählen –',
        label='Verband',
    )

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'verband', 'verein']
        labels = {'first_name': 'Vorname', 'last_name': 'Nachname', 'verein': 'Verein (optional)'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['first_name'].required = True
        self.fields['last_name'].required = True
        self.fields['password1'].help_text = self.fields['password2'].help_text = ''
        hvs = Verband.objects.filter(kuerzel='HVS').first()
        if hvs and not self.is_bound:
            self.fields['verband'].initial = hvs.pk
        self._verband_festlegen()

    def save(self, commit=True):
        # Aktuell gibt es nur den Schiedsrichter-Bereich
        self.instance.ist_schiedsrichter = True
        return super().save(commit)

    def clean_email(self):
        email = self.cleaned_data['email'].strip().lower()
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError('Diese E-Mail-Adresse ist bereits registriert.')
        return email


class LoginForm(StyledFormMixin, AuthenticationForm):
    username = forms.EmailField(label='E-Mail', widget=forms.EmailInput(attrs={'autofocus': True, 'autocomplete': 'email'}))

    def clean(self):
        if self.cleaned_data.get('username'):
            self.cleaned_data['username'] = self.cleaned_data['username'].strip().lower()
        return super().clean()

    error_messages = {
        'invalid_login': 'E-Mail oder Passwort falsch.',
        'inactive': 'Dieses Konto ist deaktiviert.',
    }


class ProfilForm(StyledFormMixin, VerbandFestMixin, forms.ModelForm):
    verband = VerbandChoiceField(queryset=Verband.objects.filter(aktiv=True), label='Verband')

    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'verband', 'verein',
            'strasse', 'plz', 'ort', 'telefon', 'iban',
            'standard_rolle', 'partner_name', 'partner_adresse',
        ]
        labels = {'first_name': 'Vorname', 'last_name': 'Nachname', 'verein': 'Verein'}
        help_texts = {
            'strasse': 'Wohnadresse – Startpunkt für die automatische km-Berechnung.',
            'partner_adresse': 'Straße, PLZ Ort – für die km der SR-B-Spalte auf dem Abrechnungsbogen.',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._verband_festlegen()


class PasswortVergessenForm(StyledFormMixin, PasswordResetForm):
    email = forms.EmailField(label='E-Mail', max_length=254, widget=forms.EmailInput(attrs={'autocomplete': 'email', 'autofocus': True}))

    def get_users(self, email):
        # E-Mails werden klein geschrieben gespeichert
        return super().get_users(email.strip().lower())


class NeuesPasswortForm(StyledFormMixin, SetPasswordForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['new_password1'].help_text = 'Mindestens 8 Zeichen.'


class PasswortAendernForm(StyledFormMixin, PasswordChangeForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['new_password1'].help_text = 'Mindestens 8 Zeichen.'
