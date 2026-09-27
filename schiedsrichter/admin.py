from django.contrib import admin
from django.utils import timezone

from .models import Assignment, Halle, Receipt
from .services import hallen


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('game_datetime', 'spielnummer', 'home_team', 'away_team', 'league', 'status', 'travel_km', 'expense_total', 'user')
    list_filter = ('status', 'competition_type', 'source')
    search_fields = ('spielnummer', 'home_team', 'away_team', 'hall', 'user__email')
    date_hierarchy = 'game_datetime'


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'season', 'total', 'payout_status', 'created_at')
    list_filter = ('payout_status', 'season')
    filter_horizontal = ('assignments',)


@admin.register(Halle)
class HalleAdmin(admin.ModelAdmin):
    list_display = ('name', 'nummer', 'adresse', 'nummer_stand', 'aktualisiert')
    list_editable = ('nummer',)
    search_fields = ('name', 'adresse', 'nummer')
    readonly_fields = ('name_key', 'adresse_key', 'nummer_stand', 'erstellt', 'aktualisiert')

    def save_model(self, request, obj, form, change):
        obj.name_key, obj.adresse_key = hallen.schluessel(obj.name), hallen.schluessel(obj.adresse)
        if 'nummer' in form.changed_data:
            obj.nummer_stand = timezone.now().replace(tzinfo=None)
        super().save_model(request, obj, form, change)
        if obj.nummer:
            # Spiele in dieser Halle ohne Nummer sofort ergänzen
            hallen.alle_erkennen(Assignment.objects.filter(hallennummer=''))
