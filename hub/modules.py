"""Bereiche (Module) der App. Das Dashboard zeigt sie als Kacheln – passend zu den Rollen des Nutzers."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Modul:
    key: str
    titel: str
    beschreibung: str
    icon: str  # Emoji als schlichtes Symbol
    rolle: str  # User-Feld, das den Bereich freischaltet
    url_name: str | None = None  # None = noch in Vorbereitung
    funktionen: tuple[str, ...] = field(default_factory=tuple)

    @property
    def verfuegbar(self) -> bool:
        return self.url_name is not None


MODULE = [
    Modul(
        key='schiedsrichter',
        titel='Schiedsrichter',
        beschreibung='Ansetzungen importieren, Spesen berechnen, Abrechnungsbögen erstellen',
        icon='🟨',
        rolle='ist_schiedsrichter',
        url_name='sr:dashboard',
        funktionen=('Einsätze & Kalender-Import', 'Spesen & Fahrt-km automatisch', 'Abrechnungsbogen (PDF)', 'Auswertung & Fristen'),
    ),
    Modul(
        key='spieler',
        titel='Spieler',
        beschreibung='Spielplan, Zu-/Absagen und persönliche Statistiken',
        icon='🤾',
        rolle='ist_spieler',
        funktionen=('Spielplan meiner Mannschaft', 'Zu-/Absagen für Spiele & Training', 'Tore, 7m, Zeitstrafen'),
    ),
    Modul(
        key='trainer',
        titel='Trainer',
        beschreibung='Kader, Verfügbarkeiten und Aufstellungen verwalten',
        icon='📋',
        rolle='ist_trainer',
        funktionen=('Kader & Verfügbarkeiten', 'Trainingsplanung', 'Aufstellung & Spielbericht'),
    ),
    Modul(
        key='verein',
        titel='Verein',
        beschreibung='Mannschaften, Termine und Mitglieder des Vereins',
        icon='🏟️',
        rolle='ist_funktionaer',
        funktionen=('Mannschaften & Spielpläne', 'Hallenbelegung', 'Mitgliederkommunikation'),
    ),
    Modul(
        key='verband',
        titel='Verband',
        beschreibung='SR-Kostenausgleich, Sammelabrechnungen und Auswertungen',
        icon='🏛️',
        rolle='ist_funktionaer',
        funktionen=('SR-Kostenausgleich', 'Sammelabrechnungen', 'Regelwerke pflegen'),
    ),
]

# Aktuell ist nur der Schiedsrichter-Bereich freigeschaltet; weitere Bereiche hier ergänzen.
AKTIVE_BEREICHE = {'schiedsrichter'}

MODULE_BY_KEY = {m.key: m for m in MODULE if m.key in AKTIVE_BEREICHE}


def module_fuer(user) -> tuple[list[Modul], list[Modul]]:
    """(meine Bereiche, weitere Bereiche) – solange nur ein Bereich aktiv ist, sieht jeder Nutzer genau diesen."""
    return list(MODULE_BY_KEY.values()), []
