from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ('email',)
    list_display = ('email', 'first_name', 'last_name', 'verband', 'verein', 'ist_schiedsrichter', 'ist_spieler', 'ist_trainer', 'is_staff')
    list_filter = ('verband', 'ist_schiedsrichter', 'ist_spieler', 'ist_trainer', 'ist_funktionaer', 'is_staff')
    search_fields = ('email', 'first_name', 'last_name', 'verein')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Person', {'fields': ('first_name', 'last_name', 'strasse', 'plz', 'ort', 'telefon', 'iban')}),
        ('Verband & Rollen', {'fields': ('verband', 'saison', 'verein', 'ist_schiedsrichter', 'ist_spieler', 'ist_trainer', 'ist_funktionaer')}),
        ('Schiedsrichter', {'fields': ('standard_rolle', 'partner_name', 'partner_adresse')}),
        ('Rechte', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Daten', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'first_name', 'last_name', 'verband', 'password1', 'password2')}),
    )
