# Liturgie-Editor für ChurchTools

Mit dieser Extension lassen sich Gottesdienstabläufe aus Liturgievorlagen in ChurchTools erstellen und bearbeiten. Die Abläufe, Termine und Lieder liegen weiterhin in ChurchTools. Die Extension speichert zusätzlich Vorlagenzuordnungen, Importstände und persönliche Bausteine im Custom-Module-Speicher.

Die Oberfläche hat zwei Bereiche: Im Hauptmodul werden Gottesdienste, Liturgien und Gesangbücher angezeigt; im Adminbereich stehen Einstellungen und Gesangbuchimporte. Bei einem bereits verwalteten Ablauf erkennt die Extension Änderungen, die außerhalb des Editors vorgenommen wurden, und fragt vor dem erneuten Anwenden einer Vorlage nach.

## Voraussetzungen

- Node.js und npm
- Eine lokale ChurchTools-Codebasis unter `../../work/churchtools` relativ zu diesem Projekt. `package.json` und `vite.config.ts` beziehen von dort Styleguide und API-Typen.
- Für die Arbeit mit echten Daten: eine ChurchTools-Instanz mit passenden Rechten für Termine, Abläufe, Songs und Custom-Module-Daten.

## Lokal starten

```bash
cp .env-example .env
npm install
npm run dev
```

In `.env` mindestens `VITE_KEY` und für eine echte Instanz `VITE_BASE_URL` setzen. Der Vite-Server läuft standardmäßig auf `http://localhost:5173`. Die ChurchTools-Instanz muss diesen Origin für lokale API-Aufrufe zulassen. Ohne konfigurierte Instanz zeigt die Anwendung lokale Beispieldaten. Schlägt die Verbindung zu einer konfigurierten Instanz fehl, wird der Fehler angezeigt.

| Variable | Zweck |
| --- | --- |
| `VITE_KEY` | In ChurchTools registrierter Extension-Key; wird auch für den Build-Pfad verwendet. |
| `VITE_BASE_URL` | ChurchTools-URL für die lokale Entwicklung. Im eingebetteten Betrieb wird `window.settings.base_url` verwendet. |
| `VITE_USERNAME`, `VITE_PASSWORD` | Optionaler Login für die lokale Entwicklung. Nur in der ignorierten `.env` verwenden und vor einem Produktionsbuild entfernen. |
| `VITE_LECTIONAR_API_URL` | Optionaler Dienst für Kirchenjahr-Vorschläge über `/api/church-year`. Ohne URL gibt es keine Vorschläge von diesem Dienst. Hier kann `https://lektionar.arnitz.org` verwendet werden. |

## Prüfen und paketieren

```bash
npm test
npm run build
npm run deploy
```

`npm test` startet Vitest. `npm run build` prüft TypeScript und erzeugt `dist/`. `npm run deploy` baut erneut und legt ein ZIP mit `dist/` unter `releases/` ab. Das ZIP kann anschließend in ChurchTools unter **Admin → Extensions** hochgeladen werden.

Ein lokaler Build bestätigt noch nicht, dass die Extension in einer konkreten ChurchTools-Instanz korrekt eingebettet ist. Vor dem Einsatz sollten Anmeldung, Berechtigungen, Import, Ablaufänderungen und das erneute Öffnen eines Gottesdienstes dort geprüft werden.

## Projektstruktur

| Pfad | Inhalt |
| --- | --- |
| `src/App.vue`, `src/ui/` | Oberfläche und Workspace-Zustand |
| `src/application/` | Anwendungsfälle für Gottesdienste, Import und gespeicherten Zustand |
| `src/churchtools/` | ChurchTools-API und Fehlerbehandlung |
| `src/domain/` | Liturgie-, Ablauf-, Import- und Abgleichlogik |
| `src/data/` | Organisationen, Liturgievorlagen und Gesangbuchkataloge |
| `scripts/package.js` | Erstellung des Extension-ZIP |

## Gespeicherter Zustand und Rechte

ChurchTools begrenzt den Wert einer Custom-Module-Datenentität auf 10.000 Zeichen. Große Importstände und Ablauf-Snapshots liegen deshalb in mehreren **Datenwerten** unter einem Manifest. Neue Shards erhalten eigene IDs und werden erst nach erfolgreichem Schreiben durch das Manifest veröffentlicht. Vorhandene Manifest-Daten der Version 1 werden weiterhin gelesen und beim nächsten Speichern umgestellt. Die tatsächliche Länge des serialisierten ChurchTools-Werts wird vor jedem Schreiben geprüft.

Zusätzliche **Datenkategorien** wären keine größeren Speichercontainer: Sie haben dasselbe Wertlimit und sind vor allem Berechtigungsgrenzen. Deshalb bleibt gemeinsam genutzter Installations- und Importzustand in der Extension-Kategorie. Persönliche Bausteine erhalten eine Kategorie pro Nutzer (`liturgy-editor-user-<Nutzer-ID>`). Der jeweilige Nutzer braucht zum ersten Speichern die ChurchTools-Berechtigung `create custom category` für dieses Custom Module; ChurchTools gibt dem Ersteller anschließend die Rechte auf seine Kategorie. Alte Bausteinwerte werden beim nächsten Speichern in die Nutzerkategorie migriert und aus der gemeinsamen Kategorie entfernt. Bis dahin bleiben sie dort lesbar. Für eine bestehende Installation müssen die Custom-Module-Rechte und die erfolgreiche Migration im echten Mandanten geprüft werden.

Die ChurchTools-API bietet für Custom-Module-Werte keine atomare Compare-and-Set-Operation. Gleichzeitig geöffnete Sitzungen können denselben Installations- oder Importstand daher weiterhin konkurrierend ändern. Die Extension lädt Wertelisten regelmäßig neu und sucht vor dem erstmaligen Anlegen eines stabilen Schlüssels erneut; das vermindert veraltete und doppelte Einträge, ersetzt aber keine serverseitige Transaktion.

Gesangbuchdaten enthalten Nummern und Titel, aber keine Liedtexte oder Noten. Für eine Weitergabe der Kataloge müssen die Rechte an den jeweiligen Quelldaten geklärt sein.
