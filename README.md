# JDS Sports

Django-App für den Spielbetrieb im Handball – Start mit dem Bereich **Schiedsrichter** (Spesenabrechnung HV Saar):
vom Kalender-Import bis zum ausgefüllten offiziellen HVS-Abrechnungsbogen als PDF. Weitere Bereiche (Spieler, Trainer,
Verein, Verband) sind im Dashboard angelegt und in Vorbereitung.

## Quickstart (Windows)

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py runserver 8010
```

App: http://localhost:8010 · Verwaltung: http://localhost:8010/admin/

- `migrate` legt automatisch alle Handball-Landesverbände, das HVS-Regelwerk 2026/27 und die Feature-Flags an.
- Admin-Konto: `.venv\Scripts\python manage.py createsuperuser`
- Daten aus der alten Node-App übernehmen (Konten inkl. Passwörter, Einsätze, Quittungen):
  `.venv\Scripts\python manage.py import_legacy` (liest `apps/api/data/jds.db`)
- Tests: `.venv\Scripts\python manage.py test`

## Aufbau

```
jds/             Projekt (Einstellungen, URLs, Formular-Styling)
accounts/        Benutzer (Anmeldung per E-Mail), Registrierung mit Verband + Rollen, Einstellungen
verbaende/       Verband (Mandant) und versionierte Regelwerke (JSON), Stammdaten-Seed nach migrate
hub/             Start-Dashboard: Kacheln je Bereich passend zu den Rollen (Schiedsrichter, Spieler, Trainer, Verein, Verband)
schiedsrichter/  Einsätze, Kalender-Import, Spesen-Engine, km-Berechnung, Quittungen/PDF, Auswertung & CSV
  services/engine.py     Spesen-Regel-Engine (deterministisch, mit Herleitung je Betrag)
  services/ics.py        ICS-Parser (nuLiga/handball.net) + Spielnummer-Erkennung (z. B. 2627SAROLCJMA0501)
  services/h360.py       CSV-Export der Handball360-Schiedsrichterplattform
  services/distance.py   Fahrt-km Wohnort → Halle (OpenStreetMap: Nominatim + OSRM, gecacht)
  services/pdf.py        Abrechnungsbogen: Original-Vordruck (data/vorlagen) + Datenebene (reportlab), zusammengeführt mit pypdf
templates/       Oberfläche (Django-Templates, Tailwind per CDN)
```

Daten: `db.sqlite3` · Quittungs-PDFs: `media/quittungen/`

## Regeln (HVS 2026/27)

Grundlage sind die Durchführungsbestimmungen 2026/27 (`schiedsrichter/data/vorlagen/`), abgebildet in
`schiedsrichter/data/rulepacks/HVS_2026_27.json` und im Admin unter „Regelwerke“ pflegbar: Sätze je Spielklasse,
Pokalrunden, Freundschaftsspiele, Turniere, Wochenspielpauschale (entfällt an Feiertagen), Doppelansetzung,
Ausfall angereist (50 %), Fahrtkosten 0,30 €/km bzw. 0,32 €/km im Gespann, anteilige km bei mehreren Spielen am Tag,
Fristen (Nichtauszahlung 14 Tage, Abgabe bis 31.01.).

Verbände ohne eigenes Regelwerk nutzen vorläufig die HVS-Sätze (Hinweis im SR-Dashboard).

## E-Mail (Mailjet) & Passwort zurücksetzen

„Passwort vergessen?“ auf der Anmeldeseite schickt einen Link (24 h gültig); angemeldet lässt sich das Passwort unter
Einstellungen → „Passwort ändern“ ändern. Der Versand läuft über die Mailjet Send API (`jds/mail.py`):

1. `.env.example` nach `.env` kopieren
2. `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` aus https://app.mailjet.com/account/apikeys eintragen
3. `DEFAULT_FROM_EMAIL` auf eine in Mailjet verifizierte Absenderadresse/Domain setzen
4. Server neu starten

Ohne Schlüssel werden E-Mails nur in der Server-Konsole ausgegeben (Entwicklung).

## Feature-Flags

Über [django-waffle](https://waffle.readthedocs.io/) im Admin: `import_webcal` (Kalender-Abo-URL), `reports_csv_export`,
`club_module_spielerplus`, `pdf_official_bogen`. Test-Override per URL `?dwft_<flag>=1`, sofern beim Flag „Testing“ aktiviert ist.

## Hinweis

Die bisherige Node/React-Version liegt unverändert in `apps/` und wird nicht mehr benötigt.
