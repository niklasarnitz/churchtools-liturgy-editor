# ChurchTools Liturgie-Editor

Die Extension ist ein Authoring-Layer für lutherische und landeskirchliche
Gemeinden. Sie ersetzt ChurchTools nicht: Events, Songs, Ablaufpläne und
Ablaufplan-Einträge bleiben native ChurchTools-Entitäten. Eigene Daten werden
nur für Ressourcen-Metadaten, Import-Mappings, Vorlagenversionen, Managed-State
und Benutzereinstellungen verwendet.

Der aktuelle Stand ist eine gemountete Vue-Main-/Admin-Oberfläche auf einem
buildbaren Domain-/Adapter-MVP mit Demo-Ressourcen. Die Live-Instanzprüfung und
der interaktive ChurchTools-Host-Smoke-Test bleiben separate Abnahmeschritte.

## Lokale Entwicklung

Voraussetzungen: Node.js passend zur lokalen ChurchTools-Codebasis und npm.

```bash
cp .env-example .env
npm install
npm run dev
```

`npm run build` führt TypeScript und Vite aus. `npm test` führt die
Vitest-Domain- und Datenvertragstests aus. `npm run preview` startet den
Produktionsbuild. `npm run deploy` baut und erstellt anschließend mit
`scripts/package.js` ein ZIP unter `releases/`.

Für die lokale ChurchTools-Anbindung muss die ChurchTools-Instanz den Vite-
Origin (typischerweise `http://localhost:5173`) in den CORS-Einstellungen
zulassen. Safari benötigt bei Cross-Origin-Cookies meist einen HTTPS-Devserver
und einen Vite-Proxy. Zugangsdaten gehören ausschließlich in die lokale,
ignorierte `.env`; sie dürfen weder committed noch in ein Extension-Bundle
gelangen.

### Template-Reset und lokale Styles

Der Reset aus dem offiziellen Boilerplate (`src/utils/reset.css`) bleibt als
Template-Datei unverändert. Er wird produktiv über `src/styles/tailwind.css`
als erste Base-Layer importiert; `src/main.ts` importiert diese Styles vor dem
Vue-Mount. Dadurch gilt der Reset auch in der eingebetteten Extension und
nicht nur im Development-Modus. Die ChurchTools-Tailwind- und Styleguide-
Quellen bleiben die maßgebliche Komponenten-/Tokenquelle.

## Konfiguration

`.env-example` dokumentiert:

- `VITE_KEY`: installierter Extension-Key;
- `VITE_BASE_URL`: lokale ChurchTools-API-URL für Development;
- `VITE_USERNAME`/`VITE_PASSWORD`: optionaler Development-Login, leer lassen,
  wenn die Session bereits im Browser besteht;
- `VITE_LECTIONAR_API_URL`: URL der separaten `lectionar`-Instanz mit
  `/api/church-year`.

Im installierten ChurchTools-Kontext verwendet das Boilerplate die von
ChurchTools gesetzte `window.settings.base_url`. Der API-Adapter in
`src/churchtools/` ist die einzige Stelle, an der native Requests stattfinden
sollen.

## Architektur

```text
src/
  churchtools/       REST-/Legacy-Adapter, Permissions, KV-State, Retry/Fehler
  data/              versionierte statische Organisationen und Ressourcen
  domain/
    agenda-generation/  Template-DSL -> normalisierte Agenda
    imports/            idempotenter Hymnal-Import und sichere Deinstallation
    lectionary/         Resolver für installierte Lektionare + Overrides
    managed-agendas/    Managed-State und konservative Synchronisation
    reconciliation/     native Agenda-Fingerprint und Drift-Erkennung
  main.ts             offizieller Boilerplate-Einstiegspunkt
```

Der offizielle `main`- und `admin`-Extension-Point wird über
`@churchtools/extension-points` typisiert. Das Paket liefert Typverträge, aber
keine Runtime-Mount-API. Die Extension muss daher ihren eigenen Vite-/Vue-
Einstieg und die Host-Event-Brücke behalten. Die offiziellen Verträge erlauben
`notification:show`; Agenda- und Song-Daten werden über REST geladen.

Das lokale ChurchTools-UI-Paket wird ausdrücklich per Path-Dependency bezogen:

```json
"@churchtools/styleguide": "file:../../work/churchtools/frontend-packages/styleguide"
```

Das entspricht `/Users/narnitz/work/churchtools/frontend-packages/styleguide`.
Keine veröffentlichte npm-Version verwenden, solange dieses lokale Paket
verfügbar ist. Die UI soll die dort verwendeten `Grid`, `GridHeader`,
`SidebarDisclosure`, `PageHeader`, `Card`, `Button`, `Form`, Dialog-, Loading-,
Empty- und Info-Komponenten nutzen. Referenz und Begründung stehen in
`docs/research/churchtools-local-audit.md`.

## Statische Daten und Registry

Alle mitgelieferten Daten liegen versioniert unter `src/data/`:

- `organizations/`: stabile Organisationen `ekiba`, `elkb`, `elk-wue`, `selk`,
  `lcms`; jede Organisation darf mehrere Hymnals, Liturgien und Lektionare
  referenzieren.
- `hymnals/`: `HymnalDefinition` mit `id`, positiver `version`, Name,
  Organisationen, Sprache und `HymnalSong[]`. Demo-Einträge enthalten keine
  Liedtexte oder Noten.
- `liturgies/`: versionierte deklarative DSL mit stabilen Node-IDs. Unterstützt
  `heading`, `fixedText`, `rubric`, `songSlot`, `readingSlot`, `sermonSlot`,
  `creed`, `prayer`, `optionalSection`, `freeTextSlot` und
  `communionSection`.
- `lectionaries/`: versionierte Tagesdaten mit Scripture-Referenzen. Das
  minimale Lektionar ist ausdrücklich ein Fixture, keine vollständige
  kirchliche Datenbank.
- `registry.ts`: gemeinsame Registry für Validierung und Domain-Tests.

Die Demo-Daten sind `eg-baden-demo` (fünf erfundene Songs),
`baden-predigtgottesdienst-demo`, `selk-hauptgottesdienst-demo` und
`demo-minimal`. Sie dürfen nicht als offizielle kirchliche Inhalte beworben
werden.

### Neue Organisation hinzufügen

1. In `src/data/organizations/index.ts` eine stabile, unveränderliche ID und
   Name/Kurzname/Sprache ergänzen.
2. Zunächst nur bereits vorhandene Ressourcen referenzieren; leere Arrays sind
   zulässig, wenn die Daten später geliefert werden.
3. Keine bestehende ID umbenennen. ID-Änderungen würden gespeicherte Mappings
   und Managed-State unbrauchbar machen.
4. `npm test` ausführen; die Registry-Validierung prüft alle Referenzen.

### Neues Gesangbuch hinzufügen

1. Neue Datei unter `src/data/hymnals/` mit stabiler Hymnal-ID und hochgezählter
   `version` anlegen und in `hymnals/index.ts` registrieren.
2. Pro Lied stabile IDs wie `resource-id:number` vergeben. Nummern dürfen
   alphanumerisch sein; Titel/Autor/Copyright nur mit gelieferten bzw.
   distributierbaren Daten aufnehmen.
3. Organisationen in `organizationIds` referenzieren und die Registry prüfen.
4. Beim Import bleibt die native ChurchTools-Song-ID im KV-Mapping; nicht nach
   Titel oder Nummer löschen.

### Neue Liturgie hinzufügen

1. Eine versionierte `LiturgyDefinition` unter `src/data/liturgies/` erstellen.
2. Jede Node-ID innerhalb des Templates stabil halten; bei einer neuen Version
   nur ändern, wenn der Node semantisch nicht mehr derselbe ist.
3. Slots ausschließlich über das gewählte Template sichtbar machen. Required-
   Slots werden vom Renderer validiert; optionale Sections können vollständig
   entfallen.
4. Organisation und optionales Lektionar referenzieren und den Renderer-Test
   um den neuen Workflow erweitern.

### Neues Lektionar hinzufügen

1. Eine versionierte Definition unter `src/data/lectionaries/` anlegen und in
   `lectionaries/index.ts` registrieren.
2. Pro Tag stabile ID, ISO-Datum und nur belastbare Referenzen angeben.
3. Organisationen referenzieren. Ein fehlender Tag ist ein fehlender Vorschlag,
   kein Grund für erfundene Fallback-Daten.
4. `src/domain/lectionary/resolver.ts` testen: explizite Auswahl gewinnt vor
   Liturgie-/Organisationsstandard; manuelle Overrides gewinnen zuletzt.

Die separate Kirchenjahr-Quelle `lectionar` stellt zusätzlich
`GET /api/church-year?date=YYYY-MM-DD&organizationId=<id>&lectionaryId=<profile>`
bereit. Die Extension behandelt dessen Werte als Vorschläge. Die vorhandene
`/api/reading`-Route bleibt eine tägliche Reading-/ICS-API und ist kein Ersatz
für die installierten Liturgie-Ressourcen. Das Kirchenjahresprofil `ekd` liefert
AT-Lesung, Epistel, Evangelium und Predigttext aus den Kalender-ICS-Dateien;
`lutherisch` ist dafür kein gültiger Profilwert mehr.

Die Application unterstützt dafür einen optionalen `deps.lectionary`-Port
(`source` oder `url` + Client) in `LiturgyEditorApplication`. Aktuell wird
dieser Port in `src/ui/useWorkspace.ts` noch nicht aus
`VITE_LECTIONAR_API_URL` verdrahtet; die UI nutzt deshalb nur lokale Demo-
Lektionare. Das ist ein konkreter Integrations-Restpunkt, kein stiller
Fallback auf eine fremde Datenquelle.

## ChurchTools-Anbindung

`ChurchToolsClientAdapter` kapselt den offiziellen
`@churchtools/churchtools-client`; `src/churchtools/*` normalisiert REST und
notwendige Legacy-Aufrufe hinter kleinen Ports.

Native Ziele:

- Event: `GET /events` und `GET /events/{id}`;
- Song: `/songs`, Arrangements und native Song Categories;
- Ablauf: `/events/{eventId}/agenda` mit nativen `header`, `text` und `song`
  Items; Song-Items verwenden `arrangementId`;
- Extension-State: Custom-Module-Kategorien/-Werte als JSON, nie als zweite
  Song- oder Agenda-Datenbank.

### Event-Abfrage: verifizierter OpenAPI-Vertrag

Die lokale Primärquelle `../../work/churchtools/docs/openApi/openapi.yaml`
definiert `DirectionParameter` ausschließlich als `forward | backward` (Default
`forward`). Die Extension verwendet für offene kommende Abfragen `from` +
`direction: 'forward'` + `limit`/`page`. Für einen explizit begrenzten Zeitraum
verwendet sie `from` + `to` ohne `direction`, `page` oder `limit`.
ChurchTools dokumentiert ausdrücklich: Bei `from` + `direction` wird `to`
ignoriert; bei `from` + `to` werden `page` und `limit` ignoriert. Die
Anwendungs-Tests prüfen beide Queryformen an `getUpcomingServices`.

Ein geplanter Ablauf wird zuerst als abstrakte normalisierte Agenda gerendert.
Erst der ChurchTools-Adapter schreibt native Items. `ManagedAgenda` speichert
Event-/Agenda-ID, Template-Version, Node-zu-Item-Mappings und Fingerprint.
Vor einem Update wird der aktuelle native Ablauf geladen. Abweichungen führen
zu einem Konflikt; ohne ausdrückliche Entscheidung wird nicht überschrieben.

## Import, Deinstallation und Updates

### Hymnal-Import

Der Importer arbeitet mit begrenzter Parallelität (Default 4), Retry und
persistiert nach jedem erfolgreichen Song-Mapping. Ein Import-State enthält:

`pending`, `running`, `partially-completed`, `completed` oder `failed`,
Fortschritt, Fehler, Resource-Version, Fingerprints und die exakte Zuordnung
`hymnalSongId -> churchToolsSongId` (plus Arrangement-ID).

Ein erneuter Lauf lädt diesen State und setzt nur fehlende/geänderte Einträge
fort. UI-Fortschritt ist `completed / total`; Teilfehler bleiben sichtbar und
können erneut versucht werden.

### Sichere Deinstallation

Vor einer Deinstallation erzeugt der Uninstaller ausschließlich einen Dry-Run.
Ein Song ist nur dann löschbar, wenn:

1. die exakt gemappte native ID noch existiert;
2. der native Fingerprint unverändert ist;
3. die ID nicht zu einer weiteren importierten Ressource gehört;
4. eine Nutzung in nativen Agenden geprüft und ausgeschlossen wurde.

Fehlt eine Prüfung oder liegt eine Änderung/Nutzung vor, bleibt der Song als
Konflikt erhalten. Es wird niemals nach Titel oder Nummer gelöscht. Jeder
erfolgreiche Delete wird sofort im State persistiert; fehlgeschlagene Löschungen
bleiben wiederaufnehmbar.

### Ressourcen-Updates

Eine neue Ressourcen-Version wird als Update angezeigt. Eindeutig zuordenbare
neue Einträge können importiert und unveränderte gemappte Einträge aktualisiert
werden. Entfernte Einträge werden nicht automatisch gelöscht, wenn sie native
Nutzung oder manuelle Änderungen aufweisen. Bereits erzeugte Agenden behalten
ihre Template-Version; Template-Updates ändern bestehende Gottesdienste nicht
unerwartet.

## Berechtigungen und Fehler

Vor schreibenden Aktionen müssen die ChurchTools-Berechtigungen geprüft werden:

- Songs lesen: `churchservice/view`;
- Songs/Kategorien ändern: passende ChurchService-Masterdata-/Kategorie-
  Berechtigung;
- Agenda lesen: `churchservice/view agenda`;
- Agenda ändern: `churchservice/edit agenda`.

Ein Benutzer kann lesen, aber nicht anlegen oder ändern dürfen. Der Adapter
normalisiert 401/403/404/409 in verständliche `ChurchToolsError`-Arten;
die UI soll fehlende Rechte, Konflikte und Netzwerkfehler getrennt anzeigen.

## Tests und Qualitätsgates

```bash
npm test
npm run build
```

Die Tests decken statische Registry-Referenzen, Template-/Slot-Auflösung,
deterministische Agenda-Erzeugung, Import-Idempotenz, Managed-State und
Reconciliation ab. `src/data/resources.test.ts` ist der Contract-Test für
IDs, Versionen, Organisationen, Querverweise und eindeutige Hymnal-Song-IDs.

Am 22.09.2026 wurde der Browser-Smoke read-only vorbereitet: In der aktuellen
Computer-Use-Umgebung waren keine Browser-Provider oder Browser-Tabs verfügbar;
deshalb gibt es keinen interaktiven Browser-/Host-Nachweis. Der vorhandene
Dev-HTTP-/Bundle-Nachweis bestätigt weiterhin, dass `src/main.ts` den
produktiven Reset lädt und das erzeugte Bundle weder `require("axios")` noch
`axios-logger` enthält. Der echte ChurchTools-Host-Smoke bleibt offen.

Für eine echte MVP-Abnahme fehlen zusätzlich Live-Gates:

- installierter Extension-Upload und echte Main-/Admin-Host-Mounts;
- Browser-/Gerätetest gegen einen ChurchTools-Mandanten mit realen Rechten;
- echter Song-Batch inklusive Arrangement-Erzeugung und App-Sichtbarkeit;
- nativer Agenda-Create/Update, Reopen, externe Änderung und Konfliktdialog;
- `lectionar`-Deployment, CORS/Auth und Antwortvertrag von `/api/church-year`;
- visuelle Prüfung der lokalen Styleguide-Komponenten auf Desktop und Mobile;
- Packaging-/Upload-Smoke-Test mit `npm run deploy`.

## Nicht-Ziele der ersten Version

Kein eigener Kalender, Eventmanager, Song-Viewer, Agenda-Ersatz,
Präsentationssystem, Foliengenerator, kollaborativer Drei-Wege-Merge oder
KI-Liturgie-Generator. ChurchTools bleibt die native Laufzeitrepräsentation.

## Weitere technische Referenzen

- `docs/research/churchtools-local-audit.md`: lokale UI-, REST-, Permission-
  und KV-Referenz.
- `docs/research/official-extension-audit.md`: offizielle Boilerplate- und
  Extension-Point-Verträge.
- `docs/research/repo-lectionar-audit.md`: Audit vor der reinen
  `lectionar`-Kirchenjahr-API.
- `key-value-store.md`: ursprüngliche Boilerplate-KV-Dokumentation.
- ChurchTools API-Diskussionen: [ChurchTools Forum](https://forum.church.tools).
