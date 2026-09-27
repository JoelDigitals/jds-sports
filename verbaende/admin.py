from django.contrib import admin

from .models import RulePack, Verband


class RulePackInline(admin.TabularInline):
    model = RulePack
    fields = ('saison', 'version', 'aktiv')
    extra = 0
    show_change_link = True


@admin.register(Verband)
class VerbandAdmin(admin.ModelAdmin):
    list_display = ('name', 'kuerzel', 'sportart', 'aktiv', 'reihenfolge')
    list_editable = ('aktiv', 'reihenfolge')
    search_fields = ('name', 'kuerzel')
    inlines = [RulePackInline]


@admin.register(RulePack)
class RulePackAdmin(admin.ModelAdmin):
    list_display = ('verband', 'saison', 'version', 'aktiv', 'erstellt')
    list_filter = ('verband', 'aktiv')
