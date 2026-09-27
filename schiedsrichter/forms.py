from django import forms

from jds.forms import StyledFormMixin

from .models import Assignment, Receipt


class AssignmentForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = Assignment
        fields = [
            'game_datetime', 'role', 'spielnummer', 'home_team', 'away_team', 'competition_type', 'league_key',
            'cup_round', 'tournament_group', 'tournament_tier', 'games_count', 'league', 'hall', 'hallennummer', 'hall_address',
            'status', 'travel_km', 'travel_km_manual', 'travel_mitfahrer', 'pnv_cost', 'other_cost', 'notes',
        ]
        widgets = {
            'game_datetime': forms.DateTimeInput(attrs={'type': 'datetime-local'}, format='%Y-%m-%dT%H:%M'),
            'notes': forms.Textarea(attrs={'rows': 2}),
            'travel_km': forms.NumberInput(attrs={'step': '0.1', 'min': 0}),
            'pnv_cost': forms.NumberInput(attrs={'step': '0.01', 'min': 0}),
            'other_cost': forms.NumberInput(attrs={'step': '0.01', 'min': 0}),
        }
        help_texts = {
            'league_key': 'Bestimmt den Spesensatz. Bei Freundschaftsspielen: Klasse des Heimvereins.',
            'hall_address': 'Straße, PLZ Ort – Grundlage der automatischen km-Berechnung.',
            'travel_km': 'Leer lassen = automatisch aus deiner Adresse und der Hallenadresse. Bei mehreren Spielen am Tag wird anteilig aufgeteilt.',
        }

    def __init__(self, *args, pack: dict, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['game_datetime'].input_formats = ['%Y-%m-%dT%H:%M']
        # Pflicht für den Abrechnungsbogen (Handball360/nuLiga, z. B. 2627SAROLCJMA0501)
        self.fields['spielnummer'].required = True
        klassen = [(c['key'], c['name']) for c in pack['classes']]
        freundschaft = [(e['key'], e['name']) for e in pack['friendlies']['explicit']]
        self.fields['league_key'] = forms.ChoiceField(
            label='Spielklasse (Regelwerk)', required=False,
            choices=[('', '– keine / unbekannt –'), ('Spielklassen', klassen), ('Freundschaftsspiele (feste Sätze)', freundschaft)],
            help_text=self.Meta.help_texts['league_key'],
        )
        self.fields['cup_round'] = forms.ChoiceField(
            label='Pokalrunde', required=False, choices=[('', '– wählen –')] + [(r['key'], f"{r['name']} ({r['rate']} €)") for r in pack['cupRounds']]
        )
        self.fields['tournament_group'] = forms.ChoiceField(
            label='Turnier-Art', required=False, choices=[('', '– wählen –')] + [(g['key'], g['name']) for g in pack['tournamentGroups']]
        )
        tiers = []
        for g in pack['tournamentGroups']:
            tiers.append((g['name'], [(t['key'], t['name']) for t in g['tiers']]))
        self.fields['tournament_tier'] = forms.ChoiceField(label='Staffel (Spielzeit)', required=False, choices=[('', '– wählen –')] + tiers)
        self.style_fields()

    def clean(self):
        data = super().clean()
        for f in ('league_key', 'cup_round', 'tournament_group', 'tournament_tier'):
            data[f] = data.get(f) or None
        comp = data.get('competition_type')
        if comp != 'cup':
            data['cup_round'] = None
        if comp != 'tournament':
            data['tournament_group'] = data['tournament_tier'] = None
            data['games_count'] = 1
        return data


class ImportForm(StyledFormMixin, forms.Form):
    QUELLEN = [('nuliga', 'nuLiga (iCal)'), ('handballnet', 'handball.net (iCal)'), ('file', 'Sonstige ICS-Datei'), ('handball360', 'Handball360 (CSV)')]

    source = forms.ChoiceField(label='Quelle', choices=QUELLEN, initial='nuliga')
    datei = forms.FileField(label='ICS- oder CSV-Datei', required=False)
    webcal_url = forms.CharField(label='oder Kalender-Abo-URL (webcal://…)', required=False)

    def clean(self):
        data = super().clean()
        if not data.get('datei') and not data.get('webcal_url'):
            raise forms.ValidationError('Bitte eine Datei auswählen oder eine Kalender-URL angeben.')
        return data


class PayoutForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = Receipt
        fields = ['payout_status', 'payout_date', 'payer']
        widgets = {'payout_date': forms.DateInput(attrs={'type': 'date'}, format='%Y-%m-%d')}
