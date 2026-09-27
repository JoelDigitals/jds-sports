# PRD – JDS Sports

**Produktanforderungen-Dokument (Product Requirements Document)**

| | |
|---|---|
| **Produkt** | JDS Sports – All-in-One Sportsapp (MVP: Handball) |
| **Version** | 0.1 (Draft) |
| **Datum** | 16.09.2026 |
| **Status** | In Review |
| **Autor** | Joel (Produktverantwortlich) |
| **Nächster Meilenstein** | Freigabe PRD → Konzept/Design → MVP-Entwicklung |

---

## 1. Executive Summary

JDS Sports soll eine modulare Sportsapp werden, die mit **Handball** startet und später um weitere Sportarten (Fußball etc.) erweitert werden kann. Die App richtet sich an alle Akteure des Spielbetriebs: **Schiedsrichter, Spieler, Trainer, Vereinsverantwortliche und Verbandsfunktionäre**.

Der zweiteilige Aufbau:

1. **MVP – Spesenabrechnung für Schiedsrichter (HV Saar):**
   Die vollständige, automatisierte Spesen- und Auslagenabrechnung für Schiedsrichter des **Handball-Verband Saar (HVSaar)**. Kernstück ist der **automatisierte Import von Spielansetzungen via ICS-Datei/iCal** (z. B. aus nuLiga bzw. künftig Handball360), aus dem die App Spesenberechnung, Quittungserstellung (offizieller DIN-A4-Abrechnungsbogen des HVS) und Jahresabrechnung automatisch ableitet. Alle Regeln (Spesensätze, Fahrtkosten, Zuschläge, Fristen) basieren auf den **Durchführungsbestimmungen des HVSaar für die Saison 2025/2026**.

2. **Integrationsziel – Handball360:**
   Login sowie Abfrage der einem Schiedsrichter zugeteilten Spiele über die Plattform **Handball360** (dem neuen zentralen Verbandsmanagementsystem des DHB, Nachfolger von nuLiga/Spielplus). Da es aktuell **keine standardmäßig öffentliche API** gibt, ist ein strukturierter Antrag beim DHB Teil der Strategie; der ICS-Import dient als primärer, sofort verfügbarer Datenweg (siehe Kapitel 8).

3. **Ausbau – „SpielerPlus-artige" Vereinsverwaltung:**
   Mannschafts-, Spielplan-, Verfügbarkeits- und Statistikfunktionen für Vereine (äquivalent zum Funktionsumfang von SpielerPlus, das durch Handball360 abgelöst wird).

Die Architektur wird von Anfang an **multi-sport- und multi-verbandsfähig** konzipiert (Sportart und Verband als konfigurierbare Module), damit Fußball & Co. später ohne Redesign ergänzt werden können.

---

## 2. Ziele & Nicht-Ziele

### 2.1 Ziele (MVP)

| # | Ziel | Messgröße |
|---|------|-----------|
| Z1 | Spesenabrechnung eines Schiedsrichters vollständig automatisiert: ICS-Import → Spesenberechnung → PDF-Quittung → Jahresübersicht | < 2 Min. Aufwand pro Spiel für den SR |
| Z2 | 100 % Abbildung der HVSaar-Regeln (Spesensätze Saison 2025/26, Fahrtkosten, Zuschläge, Ausfallregeln, Abrechnungsfristen) | Regelabdeckung lt. Testmatrix (Kap. 9.6) |
| Z3 | Offizieller DIN-A4-Abrechnungsbogen des HVS als druckfertiges PDF erzeugen | Akzeptanz durch HVS-SR-Wart (Validierung) |
| Z4 | Verlustfreie Verwaltung aller Einsätze einer Saison inkl. Statusänderungen (verlegt, abgesagt, ausgefallen) | Vollständige Historie pro Spiel |
| Z5 | Multi-User-Fähigkeit: jeder SR verwaltet seine eigenen Abrechnungen | Rollen- & Rechtemodell umgesetzt |
| Z6 | Grundarchitektur für weitere Verbände & Sportarten | Regelwerk versionierbar & konfigurierbar, ohne Code-Änderung |

### 2.2 Nicht-Ziele (MVP)

- **Keine** eigene Ansetzungs-Logik (Ansetzungen kommen vom Verband/Ansetzer, nicht aus der App).
- **Keine** Übertragung/Digitalisierung des elektronischen Spielberichts (ESB) – dies bleibt Handball360/nuLiga vorbehalten.
- **Keine** Zahlungsfunktionen / kein echtes Bezahlen von Spesen durch die App.
- **Kein** offizielles Formularwesen für Pass-/Lizenzwesen (später ggf. lesender Zugriff via Handball360-API).
- **Keine** Sportarten außer Handball im MVP (Architektur aber vorbereitet).
- **Kein** eigenständiger Liveticker / Live-Spielverwaltung im MVP.

### 2.3 Langfristige Ziele (Post-MVP, priorisiert)

1. Handball360-API-Integration (Login, Ansetzungen, ggf. Abrechnungen) – sobald Zugang gewährt wird.
2. „SpielerPlus"-Modul für Vereine (Spielplan, Verfügbarkeiten, Statistiken).
3. Erweiterung auf weitere Handball-Landesverbände (RPS-Nachbarverbände, ganz DHB).
4. Erweiterung auf weitere Sportarten (Fußball zuerst), jeweils als Regel-/Sportmodul.

---

## 3. Stakeholder & Personas

### 3.1 Personas

| Persona | Beschreibung | Primäre Nutzung |
|---|---|---|
| **Peter, 42 – Schiedsrichter** | SR im HVSaar (Bezirksliga/Verbandsliga), pfeift 2–4 Spiele/Monat, führt Abrechnungcurrently per Hand/PDF-Bogen | ICS-Import, Spesenübersicht, Quittung drucken, Jahresstatistik |
| **Sarah, 35 – Vereins-SR-Wartin** | Verwaltet SR-Soll des Vereins, beobachtet Abrechnungen | (Phase 2) Soll/Ist-Übersicht, Vereins-SR-Verwaltung |
| **Tobias, 28 – Spieler/Trainer** | Mannschaftsverantwortlicher einer Landesliga-Mannschaft | (Phase 3) Spielplan, Verfügbarkeiten, Aufstellung |
| **Kai, 50 – Kassierer Heimverein** | Zahlt Spesen am Spieltag gegen Quittung aus | QR-Code/Link zur Quittung, schnelle Kontrolle des Betrags |
| **Marc – Verband (HVSaar)** | SR-Wart/Ansetzer auf Verbandsebene | (Vision) Sammelabrechnung, SR-Kostenausgleich-Reports |

### 3.2 Stakeholder-Matrix

| Stakeholder | Interesse | Einfluss | Einbindung |
|---|---|---|---|
| Schiedsrichter (Kern-Nutzer) | Zeitersparnis, korrekte Abrechnung, kein Geld verlieren | Hoch | Interviews, Beta-Tests |
| HVSaar (SR-Wart, Geschäftsstelle) | Konforme Abrechnung, korrekte Bögen | Hoch (Formale Freigabe) | Validierung Formular & Regelwerk |
| Heimvereine / Kassierer | Zügige Auszahlung am Spieltag, prüfbare Quittung | Mittel | Feedback zur Quittungs-Ansicht |
| DHB / Handball360 (iSquad) | API-Zugang, Lizenz-/Nutzungsbedingungen | Hoch (Phase 2) | API-Antrag, ggf. Kooperationsgespräch |
| Entwicklung (intern) | Klar abgegrenztes MVP, wartbare Regel-Engine | Hoch | Reviews dieses PRD |

---

## 4. Markt- & Umfeldanalyse (Rechercheergebnisse)

### 4.1 HVSaar – Regelwerk Spesenabrechnung (Saison 2025/2026)

Quelle: *Durchführungsbestimmungen des HVSaar für die Saison 2025/2026* (hvsaar.de, Rubrik Spieltechnik/Schiedsrichter; Stand Recherche Sept. 2026). **Verbindliche Werte sind vor Release mit dem aktuellen Original-PDF abzugleichen** (siehe offene Fragen, Kap. 12).

**Spielleitungsentschädigung Meisterschaftsspiele (7.2.1):**

| Spielklasse | Satz (laut DB 2025/26) |
|---|---|
| Oberliga Saar | 35,00 € / 40,00 € * |
| Verbandsliga | 30,00 € / 35,00 € * |
| Bezirksliga | 25,00 € / 30,00 € * |
| A-Liga / B-Liga / Jugendklassen | lt. vollständiger Tabelle der DB (s. Anhang A.1, zu vervollständigen) |

> *Die Doppelspalten (z. B. „35,00 € / 40,00 €") sind im Recherche-PDF nicht eindeutig beschriftet – vermutlich **pro SR (Gespann)** vs. **Einzelschiedsrichter**. Kluärung siehe offene Fragen.

**Pokalspiele (7.2.5) – Einzelspiele:** Klassenzugehörigkeit des **Heimvereins** bestimmt den Satz, Obergrenze = Spesensatz der Oberliga Saar.

| Runde | Satz |
|---|---|
| Pokal-Qualifikation | 25,00 € |
| 1. Runde | 30,00 € |
| 2. und 3. Runde (falls keine Halbfinalturniere) | 35,00 € |
| Halbfinalturnier | 25,00 € |
| Final4 | 30,00 € |

**Freundschaftsspiele / Vorbereitungsspiele (7.2.3):**

| Klasse | Satz |
|---|---|
| Bundesliga (Aktive) & 3. Liga | 40,00 € |
| Regionalliga Männer/Frauen | 30,00 € |
| Alle anderen | 50 % der Spielleitungsentschädigung entsprechend Klassenzugehörigkeit des Heimvereins |

**Turniere & Pokalturniere (7.2.4):** Abrechnung **nach Anzahl der geleiteten Spiele**; maßgebend ist die **reine Spielzeit ohne Pausen** (Staffelung nach Spielzeit, s. Anhang A.1).

**Sonstige Spesen (7.3.7):**

| Funktion | Satz |
|---|---|
| Beobachtung / Coaching / Delegierte, je Spiel | 25,00 € |
| Zeitnehmer/Sekretäre/TD, je Spiel (nur Pokalfinale Ostermontag) | 20,00 € |
| Spielaufsicht | 40,00 € |

**Zusatzspesen (lt. DB 2023/24 – für 2025/26 verifizieren):**

| Position | Satz |
|---|---|
| Doppelansetzung (2 Spiele hintereinander in einer Halle) | + 5,00 € |
| Wochenspielpauschale (Spiele Mo–Fr) | + 5,00 € |

**Abrechnungs-/Verfahrensregeln (7.2.9):**

- Als Spesenquittung wird **ausschließlich der offizielle DIN-A4-Abrechnungsbogen des HVS** akzeptiert (aus dem SR-Info-Paket bzw. Download-Bereich der HVS-Homepage; siehe Anhang A.2 als Vorlage).
- **Bei Ausfall eines Spiels**: wenn der SR angereist war → **Hälfte der Spesen + Fahrtkosten** durch den Heimverein.
- **Fahrtkosten** gemäß Spesenordnung; dürfen **immer erst ab Landesgrenze** berechnet werden (besondere HVS-Regel!).
- **Mehrere Spiele am Tag in Folge**: Fahrtkosten **anteilig aufzuteilen**; Dokumentation in Spielprotokoll **und** Spesenquittung(en).
- **Nichtauszahlung durch Verein**: SR sendet Abrechnungsquittung **binnen 14 Tagen** mit Begründung + Bankverbindung an `schiedsrichterabrechnung@hvsaar.de`.
- **Abgabefrist**: Alle Quittungen eines Jahres bis **max. 31.01. des Folgejahres** beim Schiedsrichterwart; danach keine Auszahlung möglich.
- Der Heimverein zahlt dem SR **nach Spielend gegen Vorlage der Quittung** die Spielleitungsentschädigung bar aus (App-Unterstützung: vorbereitete Quittung + Anzahlungshinweis am Spieltag).

**Schiedsrichterkostenausgleich (7.3):** In allen Spielklassen des HVSaar (Aktive & Jugend) wird ein SR-Kostenausgleich durchgeführt; maßgeblich ist der **Spielberichtsbogen** (tatsächliche Kosten, Umwege schriftlich begründen). → Relevant für spätere Vereins-/Verbandsreports, nicht MVP-Kern.

### 4.2 Spielbetrieb-Systeme (Status Sept. 2026)

| System | Rolle | Für uns relevant |
|---|---|---|
| **nuLiga** (ARGE HBDE / nu GmbH) | Spielbetriebs-Plattform vieler Landesverbände (u. a. HVSaar bis zum Übergang), mit SR-Ansetzungsmodul, Zuständen (frei/geplant/angefordert/bestätigt/abgelehnt), SR-Freiterminen, iCal-Schnittstelle im persönlichen Bereich | **Primäre ICS-Quelle für den MVP-Import** |
| **Handball360** (DHB / iSquad MI) | Neues zentrales Verbandsmanagementsystem (Nachfolger von nuLiga & Spielplus) seit Saison 2026/27 im Rollout; privater SR-Bereich mit **Ansetzungen, Freiterminen, Protokollen, Spesenabrechnungen/Quittungen**; jede Person erhält eine **Handball-ID** | **Integrationsziel Phase 2**; App-Angebot muss sich gegenüber nativer H360-Funktion differenzieren (Multi-Verband, Historie, Statistik, Offline) |
| **Spielplus** | Bisherige Vereins-/Spielerplattform („Spielertagebuch"-Funktionen), wird durch Handball360 abgelöst | Funktionsumfang dient als **Blueprint für Phase 3** |
| **handball.net** | Öffentliches Portal (Spiele, Tabellen, SR-Profile) mit eigenem Kalenderabo (iCal) | Potentielle ergänzende Datenquelle (öffentlich) |

**Wichtige API-Einschätzung Handball360 (lt. DHB-FAQ):**
- Es gibt **keine standardmäßig öffentliche API**; API-Zugänge werden **individuell auf Anfrage vergeben** (Kontaktformular: wer, welche Daten, wofür, kommerziell?).
- Handball360 setzt auf moderne Standards (SSO, 2FA, rollenbasierte Zugriffe, Audit-Logs, „moderne Cloud- und API-Sicherheitsstandards") – ein formaler API-Zugang ist daher realistisch, aber nicht garantiert und zeitlich nicht planbar.
- **Konsequenz für das Produkt:** ICS-Import als sofort verfügbare Basis; Handball360-API als separat gemanagter Track (Antrag, siehe Kap. 8.2).

### 4.3 Wettbewerber / Comparable Lösungen

| Produkt | Abgrenzung |
|---|---|
| Handball360-SR-Bereich (nativen Abrechnungsfunktion) | Wir differenzieren über: Multi-Verband/Multi-Sport, lokale Historie & Auswertungen, Offline-PWA, ICS-Autodetect, eigene Fahrtkosten-Logik, Erinnerungen an Fristen (31.01.) |
| Excel/PDF-Abrechnung „von Hand" | Zeitaufwand-Minimierung, Fehlervermeidung, Automatisierung |
| Vereins-Apps (Spielplus-Nachfolger, Spond etc.) | Fokus Vereinsverwaltung; keine SR-Spesen-Abrechnungstiefe |

---

## 5. Produktvision & Roadmap-Übersicht

```
Phase 0 (PRD/Konzept)  ▶ Freigabe dieses Dokuments, UI-Wireframes, Datenmodell-Review
Phase 1 (MVP)          ▶ SR-Spesenabrechnung HVSaar mit ICS-Import (Kap. 7.1) + PDF-Quittung
Phase 2 (Integration)  ▶ Handball360-API (Login/Ansetzungen) ODER ICS-Weitergabe aus H360,
                         Erinnerungen, Fristenmanagement, E-Mail-Abgleich Nichtauszahlung
Phase 3 (Verein)       ▶ „SpielerPlus"-Modul: Spielplan-Import (CSV/ICS), Verfügbarkeiten,
                         Aufstellungen, Spielstatistiken
Phase 4 (Skalierung)   ▶ Weitere Verbände (Regel-Pakete), Fußball & weitere Sportarten,
                         Verbands-/Vereins-Dashboards, SR-Soll-Management
```

**Definition of Done Phase 1 (MVP):** Ein SR des HVSaar kann eine per nuLiga exportierte ICS-Datei importieren, sieht alle Ansetzungen korrekt zugeordnet, erhält automatisch berechnete Spesen inkl. Zuschlägen, druckt den offiziellen DIN-A4-Bogen als PDF und hat eine belastbare Jahresübersicht – **ohne eine Zahl manuell einzutragen** (Ausnahme: Sonderfälle wie Ausfall, Umwege, manuelle Korrekturen).

---

## 6. Systemübersicht (High-Level-Architektur)

### 6.1 Bausteine

```
┌────────────────────────────────────────────────────────────┐
│                     JDS Sports (PWA/Web + Mobile)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ SR-Modul │ │ Vereins- │ │ Regel-   │ │ Import/Export │  │
│  │ (Spesen) │ │ modul    │ │ Engine   │ │ (ICS/PDF/CSV) │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
├────────────────────────────────────────────────────────────┤
│  Kern-Services: Auth/Rollen │ Datenhaltung │ Audit │ Media │
├────────────────────────────────────────────────────────────┤
│  Konnektoren: ICS-Parser │ nuLiga (read) │ Handball360-API │
│  (Phase 2) │ handball.net-iCal │ PDF-Generator            │
├────────────────────────────────────────────────────────────┤
│  Sportbarriere: „Handball @ HVSaar" als erstes Plugin      │
│  (Regelwerk + Datenmodell + Formulare pro Verband)         │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Zentrale Designentscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Regel-Engine statt Hardcoding**: Spesensätze, Zuschläge, Fristen als versionierte Datenpakete (`Verband`, `Saison`, `Regelwerk-Version`) | Verbände/Saisons ändern Sätze jährlich; weitere Verbände/Sportarten ohne Code |
| E2 | **ICS als kanonischer Import-Weg** mit UID-basiertem Update-Mechanismus | Sofort verfügbar, herstellerneutral, nuLiga & handball.net bieten iCal an |
| E3 | **Multi-Tenancy von Tag 1** (`User → Verband(s-)kontext(e) → Saison`) | Verhindert Rewrite bei Phase 4 |
| E4 | **PWA-first** (installierbar, offline-fähige Spieltagsansicht) | SR nutzen die App in der Halle mit schlechtem Netz |
| E5 | **Formulare als Templates** (PDF-Reproduktion des offiziellen Bogens) | HVS akzeptiert nur den offiziellen DIN-A4-Bogen |
| E6 | **DSGVO by Design**: Datenminimierung, Löschkonzepte, EU-Hosting | Personenbezogene Daten (SR, Bankverbindung) |

---

## 7. Funktionale Anforderungen

### 7.1 Modul SR-Spesenabrechnung (MVP)

#### 7.1.1 Onboarding & Stammdaten

| ID | Anforderung | Priorität |
|----|---|---|
| SR-01 | Registrierung/Login (E-Mail + Passwort, 2FA optional), Passwort-Wiederherstellung | Must |
| SR-02 | Stammdaten-Profil: Name, Adresse, Vereinszugehörigkeit, Bankverbindung (IBAN), Steuernummer (optional), nuLiga-/Handball360-Kontoname (E-Mail) | Must |
| SR-03 | Standard-Wohnort (Startpunkt Fahrtkostenberechnung), alternative Startpunkte (z. B. Arbeitsplatz) | Must |
| SR-04 | Persönliche Einstellungen: Standard-SR-Rolle (SR1/SR2/Einzel-SR), Gespann-Partner pflegbar | Should |
| SR-05 | Verband & Saison auswählen (MVP: HVSaar 2025/26) | Must |

#### 7.1.2 Spiel-/Ansetzungsverwaltung

| ID | Anforderung | Priorität |
|----|---|---|
| SP-01 | **ICS-Import**: Upload einer `.ics`-Datei (nuLiga persönlicher Bereich „Schiedsrichter-Einsätze" / handball.net Kalenderabo) | Must |
| SP-02 | **Automatisches Parsing**: Datum/Uhrzeit (inkl. Zeitzone), Heim-/Gastmannschaft, Spielklasse/Liga, Wettbewerbstyp (Meisterschaft/Pokal/Freundschaftsspiel/Turnier), Halle + Adresse, SR-Rolle aus Summary/Description/Location | Must |
| SP-03 | **UID-Mapping**: Ansetzungen werden über die iCal-UID identifiziert; erneuter Import desselben Spiels aktualisiert (verlegter Termin), statt zu duplizieren | Must |
| SP-04 | **Zuordnungs-Review**: Nach Import zeigt die App eine Vorschau („Neu / Geändert / Unverändert / Konflikt") mit Bestätigung durch den Nutzer | Must |
| SP-05 | Manuelle Erfassung/Editing von Spielen (alle Felder), Schnellerfassung für nicht-importierbare Einsätze | Must |
| SP-06 | Spielstatus: `angesetzt / bestätigt / verlegt / abgesagt / ausgefallen(angereist) / ausgefallen(nicht angetreten) / geleitet` | Must |
| SP-07 | Doppelansetzungs-Erkennung (2 Spiele gleicher Tag, gleiche Halle, in Folge) → Zusatzspesen-Anzeige | Must |
| SP-08 | Kalenderansicht (Monat/Woche) + Listenansicht mit Filter (Status, Klasse, Monat, Auszahlungsstatus) | Must |
| SP-09 | Haltedaten: Änderungshistorie je Spiel (Audit-Trail) | Should |

#### 7.1.3 Spesenberechnung (Regel-Engine)

| ID | Anforderung | Priorität |
|----|---|---|
| SE-01 | Automatische Bestimmung des **Spesensatzes** aus Spielklasse + Wettbewerbstyp (Meisterschaft/Pokalrunde/Freundschaftsspiel mit %-Regel/Turnier nach Spielzeit) gemäß Regelwerk HVSaar 2025/26 | Must |
| SE-02 | Berücksichtigung **SR-Rolle** (Gespann-SR / Einzel-SR) für korrekten Satz (Klärung Doppelspalten, s. Kap. 12) | Must |
| SE-03 | **Zusatzspesen**: Wochenspielpauschale (Mo–Fr, Feiertagsausnahme), Doppelansetzung | Must |
| SE-04 | **Ausfallregelung**: Status „ausgefallen (angereist)" → automatisch **50 % Spesen** + Fahrtkosten | Must |
| SE-05 | **Fahrtkosten**: km-Erfassung (manuell oder Distanzberechnung Halledresse ↔ Wohnort), Kilometerpauschale konfigurierbar; **HVS-Sonderregel „ab Landesgrenze"** für Auslandseinsätze (bzw. für SR mit Wohnort außerhalb des Saarlandes) als Option | Must |
| SE-06 | **Anteilige Fahrtkosten** bei mehreren Spielen an einem Tag / in mehreren Orten: App schlägt Aufteilung vor, Nutzer bestätigt | Must |
| SE-07 | **Turnierabrechnung**: Anzahl geleiteter Spiele + reine Spielzeit pro Spiel → korrekte Staffel-Tabelle | Should |
| SE-08 | Regelwerk-Editor (Admin): Sätze, %-Regeln, Zuschläge, Fristen pro Verband/Saison versioniert pflegen; Gültigkeitszeitraum; Änderungen nur mit neuen Versionen | Must (Admin-Backend, rudimentär) |
| SE-09 | **Plausibilitätsprüfung** vor Quittungserstellung (Spesensatz passt zur Klasse? Mehrfachansetzung? fehlende Halle?) mit Warnungen | Must |

#### 7.1.4 Quittung & Auszahlung

| ID | Anforderung | Priorität |
|----|---|---|
| QU-01 | Generierung der **offiziellen DIN-A4-Spesenquittung (HVS)** als PDF: Layout-Reproduktion des Originalbogens (Felder lt. Anhang A.2) inkl. Feldern Spielleitungsentschädigung, Fahrtkosten, Datum/Unterschrift, SR-Stammdaten | Must |
| QU-02 | Quittung pro Spiel; Sammelquittung für mehrere Spiele eines Tages (mit anteiligen Fahrtkosten, dokumentiert) | Must |
| QU-03 | **Auszahlungs-Tracking**: `offen / bar erhalten (Datum, Kassierer) / nicht ausgezahlt` | Must |
| QU-04 | **Nichtauszahlungs-Assistent**: erinnert an 14-Tage-Frist, erzeugt vorbereitetes E-Mail an `schiedsrichterabrechnung@hvsaar.de` (Begründung + Bankverbindung + Quittung als Anhang) | Must |
| QU-05 | QR-Code/Link auf Quittung für Kassierer („Quittung prüfen": Betrag & Spieldaten, mobile-optimiert) | Should |
| QU-06 | **Fristen-Wächter**: erinnert an die Abgabefrist 31.01. des Folgejahres für noch offene/unausgezahlte Quittungen; Übersicht „Abgabepflichtig bis 31.01." | Must |

#### 7.1.5 Auswertungen & Export

| ID | Anforderung | Priorität |
|----|---|---|
| AU-01 | Jahres-/Saisonübersicht: Spiele, km, Gesamtspesen, ausstehende Beträge, Aufschlüsselung nach Klassen | Must |
| AU-02 | Export: CSV & PDF der Übersicht (auch für Steuer/SR-Kostenausgleich nutzbar) | Must |
| AU-03 | Monatsansicht & Schnellfilter „nur ausstehend" | Should |
| AU-04 | Statistiken: Spiele pro Klasse, Auslastung, durchschn. Spesen/Spiel, Top-Hallen, Saision-Vergleich (später) | Could |

### 7.2 Modul Handball360-Integration (Phase 2)

| ID | Anforderung | Priorität |
|----|---|---|
| H3-01 | **Antragsmanagement**: Formaler API-Zugangs-Antrag beim DHB (Kontaktformular handball.net-FQA-Prozess): Wer wir sind, benötigte Daten (SR-Ansetzungen, Rollen), Nutzungszweck, Kommerziell/Preise | Must (Prozess, nicht Code) |
| H3-02 | Sobald API verfügbar: OAuth/OIDC-basierte **Verknüpfung des H360-Kontos** (SSO/2FA-kompatibel), keine Passwortspeicherung Dritter | Must |
| H3-03 | **Abgleich der Ansetzungen** (Pull): geplante API-Abfragen → gleiche Datenstruktur wie ICS-Import (UID-Mapping auf Handball360-IDs) | Must |
| H3-04 | Ansetzungs-Status aus H360 übernehmen (bestätigt/abgelehnt) und im SR-Modul spiegeln | Should |
| H3-05 | **Fallback ohne API**: Anleitung + Assistenz, die H360-/nuLiga-ICS regelmäßig zu importieren (Webcal-URL direkt abonnierbar machen, Auto-Sync) | Must |
| H3-06 | Handball-ID im Profil pflegbar (für spätere ESB-/Register-Features) | Should |
| H3-07 | Klare Hinweise/Rechtliches: Nur Daten des eigenen Kontos; keine Umgehung technischer Schutzmaßnahmen; Dokumentation der Nutzungsbedingungen | Must |

> **Strategische Leitplanke:** Kein Crawling/Scraping von Handball360 mit Nutzer-Credentials im Schatten der AGB. Entweder offizielle API oder offizielle Export-/iCal-Funktionen. Das schützt das Produkt rechtlich und die Nutzerkonten.

### 7.3 Modul „SpielerPlus" – Vereinsverwaltung (Phase 3, Blueprint)

Umfang (an Spielplus-Funktionsweise angelehnt, im neuen Kontext von Handball360):

| ID | Feature | Priorität |
|----|---|---|
| VP-01 | Vereins-/Mannschaftsverwaltung (Mannschaften, Ligen, Staffeln, Trainingsgruppen) | Must (P3) |
| VP-02 | Spielplan-Import (nuLiga-CSV-Gesamtspielplan / ICS / später H360-API) | Must (P3) |
| VP-03 | Spieltag-Management: Anstoßzeit, Halle, Heim/Auswärts, Ergebnisse erfassen | Must (P3) |
| VP-04 | Verfügbarkeitsabfrage (Zusage/Absage je Spiel, Erinnerungen) | Must (P3) |
| VP-05 | Aufstellung & Spielbericht-Helper (eigene Notizen; kein offizieller ESB!) | Should (P3) |
| VP-06 | Spielerstatistiken (Tore, 7m, Zeitstrafen, Einsatzzeiten) | Should (P3) |
| VP-07 | Trainingsanwesenheit, Events, Kommunikation (Push/E-Mail) | Could (P4) |
| VP-08 | DSGVO-Konforme Verwaltung minderjähriger Spieler (Elternfreigaben) | Must (P3) |

### 7.4 Modul Multi-Sport / Multi-Verband (Phase 4, Architektur-Vorbereitung ab MVP)

| ID | Anforderung |
|----|---|
| MS-01 | „Sportart" als first-class Konzept: UI-Labels, Regel-Kategorien, Datenfelder pro Sport konfigurierbar |
| MS-02 | „Verbands-Paket" = { Regelwerk (Sätze/Fristen), Formulare-Templates, Liga-/Klassenstruktur, Import-Adapter } – versioniert & signiert |
| MS-03 | Fußball-Regelpaket (z. B. SFV-Saarland SR-Ordnung analog recherchiert) als zweites Pilotpaket |
| MS-04 | Nutzer kann Kontexte wechseln („Handball/HVSaar" ↔ „Fußball/SFV") ohne Datavermischung |

---

## 8. ICS-Import & Datenquellen (technische Spezifikation, MVP-Kern)

### 8.1 unterstützte Quellen (Priorität)

1. **nuLiga – persönlicher Bereich „Schiedsrichter-Einsätze" → iCal-Export** (HVSaar noch bis H360-Vollumstellung; einstellbar als Webcal-Feed oder Datei-Download).
2. **handball.net Kalenderabo** (öffentlich, je Team/SR-Profil; kein Login nötig).
3. **Handball360 Export/ICS** (sobald SR-Bereich iCal anbietet – wird beobachtet; H360-Rollout läuft seit Sommer 2026).
4. **Manuelle .ics-Dateien** (z. B. aus Outlook/Google exportiert, mit Ansetzungen).

### 8.2 Parser-Anforderungen

| ID | Anforderung |
|----|---|
| ICS-01 | RFC 5545-konformes Parsen: `VEVENT` mit `UID`, `DTSTART`/`DTEND` (TZID-aware, Default Europe/Berlin), `SUMMARY`, `DESCRIPTION`, `LOCATION`, `STATUS`, `SEQUENCE`, `LAST-MODIFIED`, `RRULE` (spätere Turnier-Serien) |
| ICS-02 | Mapping-Heuristik mit **lernbaren/produktseitig gepflegten Musterprofilen** je Quelle (nuLiga formatiert Summary z. B. `„[Klasse] Heim - Gast"`; h360/handball.net ggf. anders) → Feld-Extraktion: Liga/Klasse, Heim, Gast, Halle; zentrale Musterbibliothek, updatesicher |
| ICS-03 | Update-Sicherheit: gleiche `UID` + höhere `SEQUENCE`/`LAST-MODIFIED` → vorhandene Ansetzung wird aktualisiert (Terminverlegung), Status `verlegt` gesetzt, Historie bleibt |
| ICS-04 | Gelöschte/abgesagte Events (`STATUS:CANCELLED` oder Verschwinden bei Webcal-Sync) → Statuswechsel mit Review (kein Auto-Delete) |
| ICS-05 | Import-Report: zeilenweise Ergebnis (Neu/Geändert/Duplikat/Fehler) + erkannte, aber unsichere Felder zur Bestätigung |
| ICS-06 | Webcal-Abonnement (URL) mit konfigurierbarer Auto-Sync-Frequenz (z. B. 6 h) + Pull-to-Refresh |
| ICS-07 | Zeitzone/Zeitverschiebung robust (Sommer/Winterzeit, UTC-Verschlüsselung) – Unit-Tests mit Real-World-ICS-Dateien der Quellen |

### 8.3 Datenmodell (Auszug, Kern-Entitäten)

```
User (id, email, name, adress, iban, roles[], home_location_id, h360_handball_id?)
 ├── Location (id, user_id, label, address, geo)            // Wohnort/Arbeit
 ├── SeasonContext (user_id,verband_code,season)             // z.B. HVS/2025_26
 ├── Assignment (uid_source, uid, game_no?, datetime, home_team, away_team,
 │               league, competition_type, competition_round?, hall_id,
 │               role(SR1/SR2/ESR/ZNS), status, source(nuliga/h360/manual),
 │               sequence, last_modified, history[])
 ├── ExpenseCalc (assignment_id, rule_version, base_rate, role_factor,
 │                weekday_bonus, double_bonus, travel_km, km_rate,
 │                travel_share, total, breakdown json)       // vollständige Herleitung
 ├── Receipt (id, assignment_ids[], pdf_uri, payout_status, payout_date,
 │            payer?, due_date(31.01.), email_sent_at?)
 └── RulePack (verband_code, season, version, published, rules json)
      └── Rules: rate_tables, weekday_bonus, double_bonus, cancellation(50%),
         travel(km_rate, border_rule), friendlies(50%), tournaments(time_tiers),
         deadlines(submission_31_01, nonpayment_14_days, nonpayment_mail)
Hall (id, name, address, geo, verband)  // geteilte Hallendatenbank (Crowd-gepflegt)
```

---

## 9. Regel-Engine Spezifikation (Herzstück)

### 9.1 Regeltypen (Datengetrieben)

| Regeltyp | Beispiel (HVSaar 2025/26) |
|---|---|
| `RATE_TABLE` | `Oberliga=35/40€`, `Verbandsliga=30/35€`, `Bezirksliga=25/30€`, … |
| `CUP_ROUND_TABLE` | Quali 25 €, R1 30 €, R2/3 35 €, HFT 25 €, Final4 30 €; Cap: Oberliga-Satz |
| `FRIENDLIES_RULE` | Bundesliga/3.Liga 40 €; Regionalliga 30 €; sonst **50 %** vom Heimvereins-Klassensatz |
| `TOURNAMENT_TIERS` | Anzahl Spiele × Satz nach reiner Spielzeit (Staffelung Anhang A.1) |
| `WEEKDAY_BONUS` | Mo–Fr +5 €; Feiertag = kein Zuschlag (Feiertagskalender DE/Saarland) |
| `DOUBLE_BONUS` | 2 Spiele hintereinander gleiche Halle +5 € |
| `CANCELLATION_RULE` | Status `ausgefallen(angereist)` → 50 % Basis + Fahrtkosten |
| `TRAVEL_RULE` | km-Satz (konfigurierbar), HVS-Sonderregel **ab Landesgrenze**, anteilige Aufteilung bei Mehrfach-Einsätzen am Tag |
| `DEADLINE_RULES` | Nichtauszahlung → 14 Tage E-Mail; Abgabe → 31.01. Folgejahr |

### 9.2 Berechnungs-Pipeline (pro Assignment)

```
1. Context: League, CompetitionType, Round, Role, Heimverein-Klasse
2. Base rate lookup (RATE_TABLE / CUP_ROUND_TABLE / FRIENDLIES_RULE / TOURNAMENT_TIERS)
3. Apply role/caps/corrections
4. + Zusatzspesen (WEEKDAY_BONUS, DOUBLE_BONUS)
5. Travel: km (user start → hall; oder manuell) × km_rate; border_rule;
   travel_share bei Mehrfach-Einsatz
6. Status-Korrekturen (CANCELLATION_RULE → 50 %)
7. Ergebnis = ExpenseCalc (deterministisch, versioniert, komplett nachvollziehbar)
```

### 9.3 Anforderungen an die Engine

- **Determinismus & Nachvollziehbarkeit**: Jeder Betrag mit vollständiger Herleitung (`breakdown`) für SR & Verband nachprüfbar.
- **Versionierbarkeit**: Ändert der HVS Sätze während der Saison, gilt neue Regelwerk-Version ab Stichtag; Altberechnungen bleiben eingefroren.
- **Testbarkeit**: Golden-Files (reale Beispieldaten je Klasse/Runde) als Abnahmetests zusammen mit einem HVS-SR (Pilotnutzer).

### 9.4 PDF-Formular HVS-Abrechnungsbogen

- Original-DIN-A4-Bogen aus dem **SR-Info-Paket des HVS** (Quelle: hvsaar.de → Schiedsrichter → Downloads) als Vorlage (siehe Anhang A.2).
- Felder vollständig befüllbar; App-Version mit Zusatzblock „von JDS Sports erstellt" nur wenn HVS zustimmt.
- Druck (A4), Bar-Auszahlungsbestätigung, Einreichungs-Kopie für SR-Unterlagen.

### 9.5 Berechtigungen (RBAC, MVP-relevant)

| Rolle | Rechte |
|---|---|
| `USER (SR)` | Eigene Daten: Ansetzungen, Spesen, Quittungen, Profil |
| `ADMIN (App)` | Regelwerk-Editor, Formular-Templates, Musterbibliothek ICS, Nutzerverwaltung |
| Später `CLUB_ADMIN`, `ASSOCIATION_ADMIN` | Vereins-/Verbands-Sichten (Phase 3/4) |

### 9.6 Akzeptanzkriterien & Testmatrix (Auszug)

| Szenario | Erwartetes Ergebnis |
|---|---|
| ICS mit 5 Spielen (Bezirksliga, So) importiert | 5 Ansetzungen, Satz 25/30 €, keine Wochenspielpauschale |
| Verlegung: gleiche UID, neuer DTSTART | Status `verlegt`, neuer Termin, Historie-Eintrag |
| Spiel Mo, 20:00, Verbandsliga | 30/35 € + 5 € Wochenspielpauschale (Feiertag? → ohne) |
| 2 Spiele Sa, 15:00/16:30, gleiche Halle, Oberliga | 2 Sätze + 5 € Doppelansetzung, Fahrtkosten 1× (anteilig auf beide Quittungen) |
| Pokal 2. Runde, Heimverein Bezirksliga | 35 € (Rundensatz), Cap-Prüfung gegen Oberliga-Satz |
| Freundschaftsspiel, Heimverein A-Liga | 50 % vom A-Liga-Satz |
| Status „ausgefallen, angereist" | 50 % Satz + Fahrtkosten |
| Heimverein zahlt nicht | Assistent: 14-Tage-E-Mail an schiedsrichterabrechnung@hvsaar.de, vorbefüllt |
| 31.12.: 3 offene Quittungen | Fristen-Wächter listet „abgabepflichtig bis 31.01." |

---

## 10. Nichtfunktionale Anforderungen

| Kategorie | Anforderung |
|---|---|
| **Recht/DSGVO** | Einwilligungsbasierte Datenerhebung (SR-Stammdaten, IBAN = besondere Sorgfalt/Verschlüsselung), Auskunfts-/Export-/Löschfunktion, AVV mit Hosting (EU), Datenschutzerklärung, Cookie-Consent, Impressionum; minderjährigen-Schutz (Phase 3) |
| **Sicherheit** | Verschlüsselung at-rest & in-transit, 2FA-fähig, Rate-Limiting, Audit-Logs, Passwort-Reset sicher, Secrets-Management; **keine Speicherung von H360-/nuLiga-Passwörtern** (nur Tokens/Feeds) |
| **Verfügbarkeit** | Ziel 99,5 % monatlich; Wartungsfenster außerhalb Spieltags-Hauptzeiten (Sa/So Vormittag) |
| **Performance** | ICS-Import < 10 s (100 Events); PDF-Generierung < 3 s; Ladezeit PWA < 2 s |
| **Offline/PWA** | Installierbar (iOS/Android/Desktop); Spieltags-Ansicht & Quittungs-PDF offline verfügbar; Sync bei Reconnect |
| **Barrierefreiheit** | WCAG 2.1 AA anstreben (Formulare, Kontraste, Screenreader-freundliche Tabellen) |
| **i18n** | Architektur ab Tag 1: `de-DE` MVP, Struktur für `fr-FR`/`en` (Saarland: Grenzregion FR/LU!) |
| **Betrieb** | Backups täglich (30 Tage retention), Restore-Test, Monitoring/Alerting, Fehler-Reporting (mit DSGVO-konformer Pseudonymisierung) |
| **Erweiterbarkeit** | OpenAPI-beschriebene interne APIs, Event-basierte Kopplung (Import → Calc → Receipt) für spätere H360-Anbindung |

---

## 11. Technologie-Empfehlung (zur Abstimmung)

| Layer | Empfehlung (Vorschlag) | Alternativen |
|---|---|---|
| Frontend | **PWA mit React/TypeScript** (Vite, TanStack Query, Tailwind) | SvelteKit, Vue/Nuxt |
| Backend | **Node (NestJS) oder Go** mit modularen Domanen-Services | Spring Boot, .NET |
| DB | **PostgreSQL** (JSONB für Regelwerke & Breakdowns) + Objektstorage für PDFs | – |
| ICS | `ical.js`/eigener RFC-5545-Parser + Musterbibliothek (deltatauglich) | – |
| PDF | Serverseitige Templating (z. B. Puppeteer/HTML→PDF oder PDF-Library mit Formularfeldern) – exakte Reproduktion HVS-Bogen priorisieren | – |
| Auth | OIDC-fähiger IdP (z. B. Keycloak/Auth0-kompatibel), Rollenmodell RBAC | – |
| Hosting | EU-Cloud (z. B. Hetzner/scalingo/deutsche Managed K8s/Postgres) | – |
| Mobile (später) | Flutter oder React Native **erst ab Phase 3** – PWA deckt MVP & Spieltag ab | – |

> Entscheidungs-Prinzip: Das MVP muss in **8–12 Wochen** durch 1–2 Entwickler umsetzbar sein; Regel-Engine, ICS-Parser und PDF-Template sind die drei kritischen Bausteine.

---

## 12. Offene Fragen (an Produktverantwortliche / Verband)

> **Stand 17.09.2026:** F1, F2, F3, F4 und F10 sind **durch Original-Dokumente des HVSaar gelöst** (DB 2026/27 final + Abrechnungsbogen 01.07.2024, beide im Repo unter `apps/api/data/vorlagen/`). Umgesetzt in Regelwerk `2026.2-offiziell` und originalgetreuem PDF-Vordruck. Wichtige Änderung: Nichtauszahlungs-E-Mail lt. DB 2026/27 ist **hvs-schiedsrichterwart@hvsaar.de**.

| # | Frage | Wer klärt | Bis wann |
|---|---|---|---|
| ~~F1~~ | ~~Doppelspalten-Bedeutung~~ → **gelöst**: DB 2026/27 listet einfache Sätze je Klasse (OL 40 / VL 35 / BzL 30 / A 25 / B 20 €), Satz gilt je SR | erledigt | – |
| ~~F2~~ | ~~Vollständige Sätze~~ → **gelöst**: Jugend (OL A/B 30, OL C/D 25, BzL A/B 25, BzL C 25, JPJ 15 €), Turnier-/Pokalturnier-/Vorbereitungsturnier-Staffeln inkl. Jugend-/Aktiven-Sätzen aus DB 7.2.2–7.2.7 | erledigt | – |
| ~~F3~~ | ~~Offizieller DIN-A4-Bogen~~ → **gelöst**: Original „Reisekostenabrechnung für Schiedsrichter" (Stand 01.07.2024) im Repo; PDF-Generator reproduziert den Vordruck (SR-A/SR-B-Spalten, Klassen-Checkboxen, PNV/PKW 0,30/0,32 €, Abfahrt/Rückkehr, Erklärung, Fußnoten) | erledigt | – |
| ~~F4~~ | ~~Fahrtkostenordnung~~ → **gelöst**: DB 7.2.10 – 0,30 €/km + 0,02 € je Mitfahrer (= 0,32 € Gespann); anteilige Aufteilung bei Folgespielen (7.2.11); gemeinsame Anreise bei Gespann grundsätzlich Pflicht (DB S. 10) | erledigt | – |
| F5 | HVSaar-nuLiga-Instanz-URL + funktioniert der iCal-Export im persönlichen SR-Bereich aktuell (Testaccount)? | Joel | Vor MVP-Start |
| F6 | HVSaar-Migration auf Handball360: Wann stellt der HVS um? Bleibt nuLiga-iCal parallel? | Joel → HVS | Laufend |
| F7 | API-Antrag DHB/H360: Zeitpunkt, Form (kommerziell?), unser Anwendungsfall-Sizing | Joel | Phase-2-Start |
| F8 | Zielgruppe Reihenfolge Phase 3: Vereinsverwaltung für eigenen Verein zuerst oder mehrere Pilotvereine? | Joel | Nach MVP |
| F9 | Monetarisierung (kostenlos Beta, Premium für Vereine?) – beeinflusst H360-Gespräch (kommerziell ja/nein) | Joel | Vor H3-01 |
| ~~F10~~ | ~~Wochenspielpauschale & Doppelansetzung verifizieren~~ → **gelöst**: DB 2026/27 Ziff. 7.2.8 – je 5,00 €, Wochenspielpauschale Mo–Fr ausgenommen gesetzliche Feiertage | erledigt | – |

**Neu (17.09.2026): Feature-Flags nach Waffle-Vorbild** sind Bestandteil des MVP (django-waffle-Semantik in Node):
everyone / authenticated / superusers / percent-Rollout / einzelne Nutzer / **ganze Vereine** (Club-Targeting für
Pilotvereine) + Test-Override via `?dflag=NAME`. Admin-UI im Menü „Feature-Flags"; serverseitiges Gating aktiv
(Webcal-Import, CSV-Export, SpielerPlus-Pilot). Details siehe README.

---

## 13. Risiken & Gegenmaßnahmen

| Risiko | W-Ausw. | Gegenmaßnahme |
|---|---|---|
| Handball360 bietet nie/meldet API | Mittel | ICS-Import ist eigenständig wertvoll; handball.net-iCal als Backup; H360-native Abrechnung als Content-Beobachtung (Differenzierung Kap. 4.3) |
| H360 integriert eigene SR-Spesenabrechnung vollwertig (Rollout angekündigt: „Abrechnungen vollständig digital") | **Hoch** | Differenzierung: Multi-Verband/Multi-Sport, Historie/Statistik, Offline, Import beliebiger Quellen, Vereinsmodule; zeitnah MVP launchen, um Nutzerbasis & Feedback aufzubauen |
| Regelwerk-Unklarheiten (F1, F10) → falsche Berechnung | Hoch | Golden-File-Tests mit Pilot-SR; Versionierung; Korrektur-UI |
| Formular wird vom HVS nicht akzeptiert (Prozess-Update vor allem für Nichtauszahlungs-/Fristenmail) | Mittel | Frühzeitige Abstimmung (F3), Fallback: App füllt offizielles PDF-Formularfeldweise |
| nuLiga iCal ändert Format | Mittel | Musterbibliothek produktseitig updatebar (kein App-Store-Release nötig) |
| DSGVO-Bußgeldrisiko (IBAN, Adressen) | Mittel | Security-by-Design, Externes Review vor Launch |
| Umfangsrutsch (Phase 3/4 zu früh) | Hoch | Dieses PRD als verbindlicher Scope-Cut; Change-Log pflegen |

---

## 14. Liefergegenstände & Abnahmekriterien (MVP extern)

1. PWA (prod. URL, EU-hosted) mit Modul 7.1 (SR-01 … AU-02) – **Abnahme über Testmatrix 9.6 mit 100 % grün**.
2. Regelwerk-Paket „HVSaar 2025/26" (versioniert, im Admin-Editor pflegbar) – **Abnahme durch Pilot-SR gegen reale Abrechnungen der Vorsaison (Rückrechnung)**.
3. PDF-Abrechnungsbogen – **Abnahme gegen Original-Vorlage (Feld-für-Feld-Vergleich)**.
4. ICS-Import (Datei + Webcal) mit Import-Report – **Abnahme mit 3 realen nuLiga-ICS-Dateien**.
5. Betriebshandbuch & Datenschutzerklärung/Impressum – **Recht-Check**.
6. (Begleitend) H360-API-Antragsentwurf (H3-01) – **Versand dokumentiert**.

---

## Anhang

### A.1 Spesentabellen HVSaar (zu vervollständigen aus Original-DB 2025/26 – siehe F1/F2)

- Meisterschaft Aktive: Oberliga/Verbandsliga/Bezirksliga/A-Liga/B-Liga (M/F), inkl. Klarstellung Doppelspalten.
- Jugend: Klassenstaffelung (A/B/C/D-Jugend, Oberliga-/Bezirksliga-Jugend).
- Turnier-/Pokalturnier-Staffelung nach reiner Spielzeit (2×20 min / 2×25 min Tiers).
- Freundschaftsspiele-%-Regel Detail (Heimvereins-Klassenzugehörigkeit).
- Fahrtkosten-/Reisekostenordnung (km-Sätze, „ab Landesgrenze").

### A.2 Formular: offizieller DIN-A4-Abrechnungsbogen HVS (Beschaffung, s. F3)

Felder lt. Historie (ReadKong 2018/19-Infopaket) u. a.: SR-Name, Verein, Spiel(e) (Datum, Klasse, Heim, Gast, Halle), Spielleitungsentschädigung je Spiel, Fahrtkosten (km, €/km, Summe), ggf. Zusatzspesen, Gesamtsumme, „Betrag erhalten", Datum & Unterschrift SR, Verein/Kassierer. → **Aktuelle Fassung beschaffen und Feldliste hier ergänzen.**

### A.3 Quellen (Recherche 16.09.2026)

- HVSaar Durchführungsbestimmungen Saison 2025/2026: `hvsaar.de → fileadmin/…/2025_2026_Durchfuehrungsbestimmungen_20250602.pdf` (Ziffern 7.2.x, 7.3.x)
- HVSaar Durchführungsbestimmungen 2023/2024 (Zusatzspesen, Jugendstaffelung): `hvsaar.de/…/Durchfuehrungsbestimmungen_HVS__2023-2024.pdf`
- HVSaar Infopaket Schiedsrichter (Historie, Abrechnungsbogen-Felder): `hvsaar.de` / readkong-Archiv 2018/19
- DHB handball.net-FAQ (API-Vergabe, H360-Konto, Spielplus-Ablösung): `dhb.de/handballnet-faq`
- DHB H360-FAQ (Handball-ID, Registrierung, Rollen): `dhb.de/handball360/faq…`
- DHB News: H360 SR-Bereich/Freitermine/„Abrechnungen vollständig digital" (15.07.2026), ESB-funktionsfähig (21.08.2026)
- HVNB H360-Tutorial SR-Plattform (Login, Ansetzungen, Protokolle, Abrechnungen): `hvnb-online.de/…/H360-Tutorial-fuer-Schiedsrichter-V2.0.pdf`
- nuLiga-Doku (SR-Ansetzungsmodul, Zustände, iCal-Schnittstelle): `nu-gmbh.atlassian.net` (ARGE HBDE public), `hvberlin.de → iCal Schnittstelle`
- SFV Saarland SR-Ordnung (für späteres Fußball-Paket): `saar-fv.de/…/Schiedsrichterordnung.pdf`

### A.4 Begriffe (Glossar)

| Begriff | Erklärung |
|---|---|
| **Spesen / Spielleitungsentschädigung** | Pauschale, die der Heimverein dem SR nach Spielend bar gegen Quittung auszahlt |
| **SR-Kostenausgleich** | Verbandsinterner Ausgleich tatsächlicher Kosten lt. Spielberichtsbogen (HVS 7.3) |
| **ESB** | Elektronischer Spielberichtsbogen (H360/nuLiga) – nicht Teil des MVP |
| **Handball-ID** | Zentrale Personen-ID in Handball360 (Pass, Lizenzen, Rollen) |
| **nuLiga** | Bisherige Spielbetriebsplattform der Landesverbände (iCal-Schnittstelle im persönlichen Bereich) |
| **Handball360** | Neues DHB-Verbandsmanagementsystem (iSquad MI), Nachfolger nuLiga/Spielplus, Rollout ab Saison 2026/27 |
| **iCal/ICS** | Standard-Kalenderformat (RFC 5545) für Termine & Abos |
| **Doppelansetzung** | 2 Spiele hintereinander in derselben Halle am selben Tag (+ Zusatzspesen) |
| **SR-Soll** | Von Vereinen zu stellende Anzahl Schiedsrichter (HVS-Sollstrafen bei Nichterfüllung) |

---

*Ende der PRD v0.1 – Änderungen nur mit Versionserhöhung und Change-Log-Eintrag.*
