import type { GridLocale, GridMessages } from "./locale-messages.js";
const logicNames = new Map([
  ["AND", "UND"],
  ["OR", "ODER"],
  ["NOT", "NICHT"],
]);
const logicName = (value: string) =>
  logicNames.get(value.toUpperCase()) ?? value;
const aggregateNames = new Map([
  ["sum", "Summe"],
  ["avg", "Durchschnitt"],
  ["min", "Minimum"],
  ["max", "Maximum"],
  ["count", "Anzahl"],
]);
const aggregateName = (value: string) =>
  aggregateNames.get(value.toLowerCase()) ?? value;
/** Original German translations of the complete OpenGrid-owned message catalog. */
export const deMessages = Object.freeze({
  "theme.label": "Farbschema",
  "theme.system": "System",
  "theme.light": "Hell",
  "theme.dark": "Dunkel",
  "sidePanel.columns": "Spalten",
  "sidePanel.filters": "Filter",
  "sidePanel.search": "Spalten suchen",
  "sidePanel.values": "Werte",
  "sidePanel.rowGroups": "Zeilengruppen",
  "sidePanel.noColumns": "Keine passenden Spalten",
  "sidePanel.noValues": "Hier können Zahlenspalten aggregiert werden.",
  "sidePanel.noAggregate": "Keine",
  "sidePanel.customAggregate": "Benutzerdefiniert",
  "sidePanel.groupColumn": "Nach {column} gruppieren",
  "sidePanel.dragHint":
    "In Zeilengruppen ziehen oder zum Umschalten der Gruppierung aktivieren.",
  "sidePanel.collapseGroup": "Spalten von {group} zuklappen",
  "sidePanel.expandGroup": "Spalten von {group} aufklappen",
  "sidePanel.aggregate.sum": "Summe",
  "sidePanel.aggregate.avg": "Durchschnitt",
  "sidePanel.aggregate.min": "Minimum",
  "sidePanel.aggregate.max": "Maximum",
  "sidePanel.aggregate.count": "Anzahl",
  "sidePanel.providerHint":
    "Gruppierung, Werte und Bedingungen werden beim Datenanbieter ausgeführt.",
  "sidePanel.unknownGroups":
    "Einige gruppierte Felder sind nicht in dieser Spaltenliste enthalten.",
  "workspace.label": "Tabellenbereiche",
  "workspace.open": "Tabellenbereiche öffnen",
  "workspace.close": "Tabellenbereiche schließen",
  "grid.keyboardHelp": "Tastaturhilfe",
  "columnMenu.open": (p) => `Spaltenmenü für ${p.column}`,
  "columnMenu.title": (p) => `Spaltenbefehle für ${p.column}`,
  "columnMenu.sortAsc": "Aufsteigend sortieren",
  "columnMenu.sortDesc": "Absteigend sortieren",
  "columnMenu.sortClear": "Diese Sortierung entfernen",
  "columnMenu.unpin": "Spaltenfixierung aufheben",
  "columnMenu.group": (p) => `Nach ${p.column} gruppieren`,
  "columnMenu.ungroup": (p) => `Gruppierung nach ${p.column} entfernen`,
  "columnMenu.hide": (p) => `${p.column} ausblenden`,
  "columnMenu.autoSize": "Breite dieser Spalte anpassen",
  "columnMenu.autoSizeRendered": "Breite gerenderter Spalten anpassen",
  "columnMenu.fit": "Spalten an die Tabellenbreite anpassen",
  "columnMenu.resetWidth": "Diese Breite zurücksetzen",
  "columnMenu.filter": "Spaltenfilter fokussieren",
  "columnMenu.chooser": "Spalten auswählen",
  "columnMenu.expand": "Gruppen aufklappen",
  "columnMenu.collapse": "Gruppen zuklappen",
  "columnMenu.unavailable":
    "Der Spaltenbefehl ist vorübergehend nicht verfügbar.",
  "columnMenu.sizingCancelled":
    "Die Breitenanpassung wurde abgebrochen. Versuchen Sie es erneut.",
  "columnMenu.noSamples":
    "Es ist kein gerenderter Standardtext zum Messen vorhanden.",
  "columnMenu.groupLimit":
    "Diese Hierarchie überschreitet das Aufklapplimit des Menüs.",
  "columnMenu.applied": (p) => `Spaltenbefehl auf ${p.column} angewendet`,
  "contextMenu.changed":
    "Die Tabelle wurde beim Vorbereiten des Menüs geändert. Öffnen Sie es erneut.",
  "contextMenu.title": (p) => `Befehle für ${p.column}, Zeile ${p.rowId}`,
  "contextMenu.failed": "Der Menübefehl konnte nicht ausgeführt werden.",
  "contextMenu.running": "Befehl wird ausgeführt.",
  "contextMenu.copyCell": "Zelle kopieren",
  "multiFilter.title": (p) => `Kombinierte Filter für ${p.column}`,
  "multiFilter.help":
    "Übernehmen Sie die Einstellungen der einzelnen Teilfilter und danach den kombinierten Filter. Alle aktiven Teilfilter müssen zutreffen.",
  "multiFilter.unreadable":
    "Der angewendete Filter konnte nicht gelesen werden. Laden Sie ihn vor dem Übernehmen neu.",
  "multiFilter.conflict":
    "Der angewendete Filter wurde geändert. Laden Sie ihn neu oder behalten Sie Ihre vorbereiteten Filter ausdrücklich bei.",
  "multiFilter.failed":
    "Der kombinierte Filter konnte nicht angewendet werden.",
  "multiFilter.unsupported":
    "Diese Teilfilter können die aktuellen Einstellungen nicht bearbeiten. Neue Filter ersetzen diese Einstellungen erst beim Übernehmen.",
  "multiFilter.reload": "Angewendete Filter neu laden",
  "multiFilter.keep": "Vorbereitete Filter behalten",
  "multiFilter.replace": "Neue Teilfilter beginnen",
  "multiFilter.child": (p) => `${p.label} bearbeiten`,
  "multiFilter.childFailed": (p) =>
    `${p.label} konnte nicht vorbereitet werden. Korrigieren oder löschen Sie die Einstellungen.`,
  "multiFilter.count": (p, f) =>
    `${f.number(p.count)} von ${f.number(p.total)} aktiv`,
  "multiFilter.pending": "Vorbereitete Änderungen sind noch nicht übernommen.",
  "multiFilter.clearDraft": "Vorbereitete Filter löschen",
  "multiFilter.apply": "Kombinierten Filter anwenden",
  "hierarchy.changed":
    "Die Zeilenhierarchie wurde geändert. Wiederholen Sie die Auswahl.",
  "hierarchy.unavailable": "Die Hierarchieauswahl ist nicht verfügbar.",
  "hierarchy.selectSubtree": (p) => `Teilbaum ${p.label} auswählen`,
  "hierarchy.selectPage": "Teilbäume dieser Seite auswählen",
  "richSelect.open": (p) => `${p.label} auswählen`,
  "richSelect.title": (p) => `${p.label} auswählen`,
  "richSelect.search": (p) => `Auswahlmöglichkeiten für ${p.label} durchsuchen`,
  "richSelect.choices": (p) => `Auswahlmöglichkeiten für ${p.label}`,
  "richSelect.help":
    "Suchen Sie oder wählen Sie mit den Pfeiltasten. Eingabe oder Übernehmen speichert die Auswahl; Escape bricht ab.",
  "richSelect.apply": "Auswahl übernehmen",
  "richSelect.noMatches": "Keine passenden Auswahlmöglichkeiten",
  "richSelect.blank": "(leer)",
  "richSelect.count": (p, f) =>
    `${f.number(p.count)} ${p.count === 1 ? "Auswahlmöglichkeit" : "Auswahlmöglichkeiten"}`,
  "richSelect.invalidOptions":
    "Die Auswahlliste ist ungültig oder überschreitet die unterstützten Grenzen.",
  "richSelect.unavailable":
    "Die aktuelle Auswahl ist nicht verfügbar. Wählen Sie einen aufgeführten Wert aus.",
  "richSelect.failed": "Die Auswahl konnte nicht übernommen werden.",
  "richSelect.changed":
    "Die Auswahlmöglichkeiten wurden geändert. Wählen Sie erneut einen verfügbaren Wert.",
  "richSelect.rejected": "Diese Auswahl konnte nicht übernommen werden.",
  "richSelect.applying": "Auswahl wird übernommen.",
  "common.cancel": "Abbrechen",
  "common.clear": "Leeren",
  "common.remove": "Entfernen",
  "common.close": "Schließen",
  "common.previous": "Zurück",
  "common.next": "Weiter",
  "common.true": "Wahr",
  "common.false": "Falsch",
  "common.none": "(keine)",
  "common.retry": "Erneut versuchen",
  "grid.ariaLabel": "Datentabelle",
  "grid.tools": "Tabellenwerkzeuge",
  "grid.searchLabel": "Alle Zeilen durchsuchen",
  "grid.searchPlaceholder": "Alle Zeilen durchsuchen...",
  "grid.moveUp": "Fokussierte Zeile nach oben verschieben",
  "grid.moveDown": "Fokussierte Zeile nach unten verschieben",
  "grid.editRow": "Zeile bearbeiten",
  "grid.editFocusedCell": "Zelle bearbeiten",
  "grid.extendRange": "Bereich erweitern",
  "grid.extendRangeHelp":
    "Tippen Sie auf eine Zelle, um den aktuellen Bereich zu erweitern. Vor der Auswahl des Endpunkts können Sie scrollen.",
  "grid.fillMode": "Ausfüllmodus",
  "grid.fillCopy": "Werte kopieren",
  "grid.fillSeries": "Zahlenreihe fortsetzen",
  "grid.touchHelp":
    "Tippen Sie auf eine Zelle, um sie zu fokussieren. Tippen Sie zweimal auf eine bearbeitbare Zelle oder verwenden Sie Zelle bearbeiten. Navigieren Sie durch Scrollen oder Zoomen.",
  "grid.touchMoveHelp":
    "Verwenden Sie auf Touchscreens Fokussierte Zeile nach oben oder unten verschieben, um Zeilen neu anzuordnen.",
  "grid.find": "Suchen",
  "grid.note": "Notiz",
  "grid.advancedFilter": "Erweiterter Filter",
  "grid.copy": "Kopieren",
  "grid.copyLabel": "Ausgewählte Zellen kopieren",
  "grid.paste": "Einfügen",
  "grid.pasteLabel": "Zellen einfügen",
  "grid.fillDown": "Nach unten ausfüllen",
  "grid.fillDownLabel": "Ausgewählte Zellen nach unten ausfüllen",
  "grid.undo": "Rückgängig",
  "grid.redo": "Wiederholen",
  "grid.undoRequested": "Rückgängig angefordert",
  "grid.redoRequested": "Wiederholen angefordert",
  "grid.exportCsv": "CSV exportieren",
  "grid.columns": "Spalten",
  "grid.arrangeView": "Ansicht anpassen",
  "grid.unpinned": "Nicht fixiert",
  "grid.pinLeft": "Links fixieren",
  "grid.pinRight": "Rechts fixieren",
  "grid.rowControls": "Zeilensteuerung",
  "grid.selectPage": "Alle Zeilen dieser Seite auswählen",
  "grid.pinnedTop": "Oben fixierte Zeilen",
  "grid.pinnedBottom": "Unten fixierte Zeilen",
  "grid.noColumns": "Keine sichtbaren Spalten",
  "grid.empty": "Keine passenden Zeilen",
  "grid.rowsPerPage": "Zeilen pro Seite",
  "grid.previousPage": "Vorherige Seite",
  "grid.nextPage": "Nächste Seite",
  "grid.cellUpdated": "Zelle aktualisiert",
  "grid.editRequested":
    "Änderung angefordert. Die Anwendung bestimmt, wann die Daten aktualisiert werden.",
  "range.requested":
    "Bereichsänderung angefordert. Die Anwendung bestimmt, wann die Daten aktualisiert werden.",
  "rowEdit.request": "Zeile übermitteln",
  "grid.changeUndone": "Änderung rückgängig gemacht",
  "grid.changeRedone": "Änderung wiederholt",
  "grid.noHistory": "Keine Bearbeitungen zum Wiederherstellen",
  "grid.hiddenEditCancelled":
    "Bearbeitung abgebrochen, da die Zelle nicht mehr sichtbar ist",
  "grid.columnSpanHelp":
    "Spaltenübergreifende Zellen sind eingerichtet. Zellbereiche, Tabellenzwischenablage und Ausfüllen sind nicht verfügbar; Zeilenauswahl und Zellbearbeitung bleiben verfügbar.",
  "find.label": "In aktueller Ansicht suchen",
  "find.placeholder": "Suchen, ohne Zeilen zu filtern",
  "find.previous": "Vorheriger Suchtreffer",
  "find.next": "Nächster Suchtreffer",
  "find.close": "Suche schließen",
  "find.none": "Keine Treffer",
  "move.unsupported":
    "Diese Datenquelle unterstützt kein verwaltetes Verschieben von Zeilen",
  "move.disabled": "Das Verschieben von Zeilen ist nicht aktiviert",
  "move.noColumns": "Blenden Sie vor dem Verschieben eine Datenspalte ein",
  "move.editing":
    "Beenden oder verwerfen Sie die Bearbeitung vor dem Verschieben",
  "move.pins":
    "Entfernen Sie vor dem Verschieben die fixierten Zeilen aus dieser Ansicht",
  "move.fullWidth":
    "Deaktivieren Sie vor dem Verschieben die Zeilen über die gesamte Breite",
  "move.details": "Schließen Sie vor dem Verschieben die Detailbereiche",
  "move.flat": "Verwaltetes Verschieben erfordert gewöhnliche flache Zeilen",
  "move.changed":
    "Die Zeilenansicht wurde geändert. Beginnen Sie das Verschieben erneut.",
  "move.cancelled": "Zeilenverschiebung abgebrochen",
  "move.pageOnly": "Zeilen müssen auf derselben Seite bleiben",
  "move.failed": "Diese Zeile konnte nicht verschoben werden",
  "move.first": "Die Zeile steht auf dieser Seite bereits an erster Stelle",
  "move.last": "Die Zeile steht auf dieser Seite bereits an letzter Stelle",
  "move.foreign": "Hier können nur Zeilen aus dieser Tabelle abgelegt werden",
  "move.sorting": "Entfernen Sie vor dem Neuanordnen die Sortierung",
  "move.filtering": "Entfernen Sie vor dem Neuanordnen die Filter",
  "move.grouping": "Entfernen Sie vor dem Neuanordnen die Gruppierung",
  "move.tree": "Das Neuanordnen von Zeilen ist bei Baumdaten nicht verfügbar",
  "move.externalFilter":
    "Entfernen Sie vor dem Neuanordnen den externen Filter",
  "filter.all": "Alle",
  "filter.contains": "Enthält",
  "filter.notContains": "Enthält nicht",
  "filter.equals": "Ist gleich",
  "filter.notEqual": "Ist ungleich",
  "filter.startsWith": "Beginnt mit",
  "filter.endsWith": "Endet mit",
  "filter.gt": "Größer als",
  "filter.gte": "Größer oder gleich",
  "filter.lt": "Kleiner als",
  "filter.lte": "Kleiner oder gleich",
  "filter.in": "Ist einer von",
  "filter.between": "Zwischen",
  "filter.blank": "Ist leer",
  "filter.notBlank": "Ist nicht leer",
  "filter.fromDate": "Ab Datum",
  "filter.toDate": "Bis Datum",
  "filter.min": "Minimum",
  "filter.max": "Maximum",
  "filter.chooseBoolean": "Wahrheitswert auswählen",
  "filter.invalidDate": "Ungültiges Datum",
  "rangeFilter.notRange":
    "Der aktuelle Filter ist kein inklusiver Bereich. Ändern Sie eine Grenze oder löschen Sie den Filter, um ihn zu ersetzen.",
  "rangeFilter.boundLimit": "Jede Bereichsgrenze ist auf 256 Zeichen begrenzt",
  "rangeFilter.integer":
    "Geben Sie für jede BigInt-Grenze eine vollständige ganze Zahl ein",
  "rangeFilter.iso":
    "Verwenden Sie für jede Datumsgrenze ein ISO-Datum oder einen ISO-Zeitstempel",
  "rangeFilter.date":
    "Geben Sie für jede Datumsgrenze ein gültiges Kalenderdatum ein",
  "rangeFilter.number":
    "Geben Sie für jede Bereichsgrenze eine vollständige endliche Zahl ein",
  "rangeFilter.type":
    "Dieser Bereichsfilter unterstützt Zahlen-, BigInt- und Datumsspalten",
  "rangeFilter.order": "Das Minimum darf das Maximum nicht überschreiten",
  "rangeFilter.applyFailed": "Dieser Bereich konnte nicht angewendet werden",
  "rangeFilter.clearFailed": "Dieser Bereich konnte nicht gelöscht werden",
  "builder.title": "Erweiterter Filter",
  "builder.help":
    "Erstellen Sie verschachtelte Bedingungen mit UND, ODER und NICHT. Mengen akzeptieren ein JSON-Array oder einen Wert pro Zeile. Schreiben Sie große ganze Zahlen in JSON als Zeichenketten. Änderungen werden beim Übernehmen wirksam.",
  "builder.noColumns": "Keine filterbaren Spalten",
  "builder.empty": "Kein erweiterter Filter",
  "builder.clear": "Entwurf leeren",
  "builder.apply": "Filter anwenden",
  "builder.addCondition": "Bedingung hinzufügen",
  "builder.and": "UND",
  "builder.or": "ODER",
  "builder.not": "NICHT",
  "builder.negate": "Bedingung verneinen",
  "builder.removeGroup": "Gruppe entfernen",
  "builder.unsupported": "Nicht unterstützter erweiterter Filterausdruck",
  "builder.readFailed": "Dieser Filter kann nicht gelesen werden",
  "builder.arraySyntax":
    "Mengenwerte müssen ein gültiges JSON-Array oder ein Wert pro Zeile sein",
  "builder.arrayRequired": "Mengenwerte müssen ein JSON-Array sein",
  "builder.scalarValues":
    "Mengenwerte dürfen nur Zeichenketten, Zahlen, Wahrheitswerte oder null enthalten",
  "builder.emptySet": "Geben Sie mindestens einen Mengenwert ein",
  "builder.bigIntJson":
    "Verwenden Sie für große BigInt-Werte Zeichenketten in JSON-Arrays",
  "builder.emptyGroup":
    "Jede UND- oder ODER-Gruppe benötigt mindestens eine Bedingung",
  "builder.applyFailed": "Dieser Filter konnte nicht angewendet werden",
  "editor.choose": "Wert auswählen",
  "editor.loading": "Auswahlmöglichkeiten werden geladen...",
  "editor.retry": "Auswahlmöglichkeiten erneut laden",
  "editor.invalidChoices":
    "Der Anbieter hat ungültige Auswahlmöglichkeiten geliefert",
  "editor.loadFailed": "Auswahlmöglichkeiten konnten nicht geladen werden",
  "rowEdit.startFailed": "Die Zeilenbearbeitung konnte nicht gestartet werden",
  "rowEdit.noFields":
    "Diese Zeile enthält keine sichtbaren bearbeitbaren Felder",
  "rowEdit.saveFailed": "Diese Zeile konnte nicht gespeichert werden",
  "rowEdit.discardReload": "Entwurf verwerfen und neu laden",
  "rowEdit.keepEditing": "Weiter bearbeiten",
  "rowEdit.reload": "Zeile neu laden",
  "rowEdit.save": "Zeile speichern",
  "note.title": "Zellnotiz",
  "note.text": "Notiztext",
  "note.readFailed": "Diese Notiz konnte nicht gelesen werden",
  "note.saveFailed": "Diese Notiz konnte nicht gespeichert werden",
  "note.delete": "Notiz löschen",
  "note.save": "Notiz speichern",
  "range.filled":
    "Bereich ausgefüllt. Rückgängig stellt die vorherigen Werte wieder her.",
  "range.copied": "Ausgewählte Zellen kopiert.",
  "range.copyFailed": "Zellen konnten nicht kopiert werden",
  "range.pasted":
    "Zellen eingefügt. Rückgängig stellt die vorherigen Werte wieder her.",
  "range.copyUnavailable":
    "Der Zugriff auf die Zwischenablage ist nicht verfügbar. Verwenden Sie das Tastenkürzel zum Kopieren.",
  "range.pasteUnavailable":
    "Der Zugriff auf die Zwischenablage ist nicht verfügbar. Verwenden Sie das Tastenkürzel zum Einfügen.",
  "range.writeFailed": "Schreiben in die Zwischenablage fehlgeschlagen",
  "range.readFailed": "Lesen aus der Zwischenablage fehlgeschlagen",
  "remote.serverLabel": "Server-Datentabelle",
  "remote.liveLabel": "Live-Datentabelle",
  "remote.infiniteLabel": "Fortlaufende Datentabelle",
  "remote.infiniteCount": (p, f) =>
    `${f.number(p.count)} ${p.count === 1 ? "Zeile" : "Zeilen"}`,
  "remote.retryInfinite": "Fortlaufende Zeilen erneut laden",
  "remote.emptyInfinite": "Keine Zeilen",
  "remote.allGroups": "Alle Gruppen",
  "remote.columns": "Serverspalten",
  "remote.loading": "Serverzeilen werden geladen... ",
  "remote.routePending": "Zeilenanzahl dieses Pfads wird ermittelt",
  "remote.retryServer": "Serverzeilen erneut laden",
  "remote.previousPage": "Vorherige Serverseite",
  "remote.nextPage": "Nächste Serverseite",
  "remote.countPending": "Entfernte Zeilenanzahl wird ermittelt",
  "remote.retryLive": "Live-Zeilen erneut laden",
  "remote.emptyLive": "Keine Live-Zeilen",
  "chart.label": "Tabellendiagramm",
  "chart.config": "Diagrammeinstellungen",
  "chart.type": "Diagrammtyp",
  "chart.bar": "Balken",
  "chart.line": "Linie",
  "chart.scatter": "Punkte",
  "chart.xColumn": "X-Spalte des Diagramms",
  "chart.noColumns": "Keine Spalten",
  "chart.aggregation": "Diagrammaggregation",
  "chart.sum": "Summe",
  "chart.average": "Durchschnitt",
  "chart.series": "Zahlenreihen",
  "chart.export": "Diagramm als SVG exportieren",
  "chart.exported": "Diagramm als SVG exportiert",
  "chart.unavailable":
    "Der Diagrammexport ist in diesem Browser nicht verfügbar",
  "chart.rangeGone": "Der ausgewählte Bereich ist nicht mehr sichtbar.",
  "chart.scatterHelp": "Punktdiagramme verwenden numerische X-Werte.",
  "chart.empty": "Keine endlichen Zahlenwerte für das Diagramm",
  "chart.legend": "Diagrammlegende",
  "print.title": "Tabellendruckansicht",
  "print.filtered": "Sortierte und gefilterte Zeilen",
  "print.view": "Aufgeklappte Gruppen-/Baumansicht",
  "print.page": "Aktuelle Seite",
  "print.selected": "Ausgewählte Zeilen im aktuellen Filterergebnis",
  "print.all": "Alle Quellzeilen (Eingabereihenfolge)",
  "print.unknown": "Unbekannter Umfang",
  "print.buildFailed": "Die Druckmomentaufnahme konnte nicht erstellt werden",
  "print.requested":
    "Druckdialog angefordert. Die Browsereinstellungen bestimmen die endgültige Ausgabe.",
  "print.unavailable": "Drucken ist in diesem Browser nicht verfügbar.",
  "print.refreshed": "Momentaufnahme aktualisiert.",
  "print.refresh": "Druckmomentaufnahme aktualisieren",
  "print.print": "Momentaufnahme drucken",
  "print.stale":
    "Die Tabelle wurde geändert. Aktualisieren Sie die Momentaufnahme vor dem Drucken.",
  "print.captured":
    "Erfasste Momentaufnahme; spätere Änderungen verändern ihre Werte nicht.",
  "print.empty": "Keine Zeilen in diesem Druckumfang.",
  "grid.showColumn": (p) => `${p.column} anzeigen`,
  "grid.pinColumn": (p) => `${p.column} fixieren`,
  "grid.moveColumnLeft": (p) => `${p.column} nach links verschieben`,
  "grid.moveColumnRight": (p) => `${p.column} nach rechts verschieben`,
  "grid.sortColumn": (p) => `${p.column} sortieren`,
  "grid.resizeColumn": (p) => `Breite von ${p.column} ändern`,
  "grid.filterColumn": (p) => `${p.column} filtern`,
  "grid.editCell": (p) => `${p.column} in Zeile ${p.rowId} bearbeiten`,
  "grid.selectRow": (p) => `Zeile ${p.rowId} auswählen`,
  "grid.dragRow": (p) => `Zeile ${p.rowId} ziehen`,
  "grid.expandDetails": (p) => `Details der Zeile ${p.rowId} aufklappen`,
  "grid.collapseDetails": (p) => `Details der Zeile ${p.rowId} zuklappen`,
  "grid.details": (p) => `Details der Zeile ${p.rowId}`,
  "grid.expandGroup": (p) => `${p.group} aufklappen`,
  "grid.collapseGroup": (p) => `${p.group} zuklappen`,
  "grid.rowCount": (p, f) =>
    `${f.number(p.count)} ${p.count === 1 ? "Zeile" : "Zeilen"}`,
  "grid.selectedCount": (p, f) => `${f.number(p.count)} ausgewählt`,
  "grid.cellCount": (p, f) =>
    `${f.number(p.count)} ${p.count === 1 ? "Zelle" : "Zellen"} ausgewählt`,
  "grid.pageCount": (p, f) =>
    `Seite ${f.number(p.page)} von ${f.number(p.pages)}`,
  "find.position": (p, f) => `${f.number(p.position)} von ${f.number(p.count)}`,
  "move.moved": (p, f) =>
    `Zeile ${p.rowId} auf Position ${f.number(p.position)} dieser Seite verschoben`,
  "move.moving": (p) =>
    `Zeile ${p.rowId} wird verschoben. Legen Sie sie vor oder nach einer anderen Zeile dieser Seite ab.`,
  "headers.expand": (p) => `Spaltengruppe ${p.path} aufklappen`,
  "headers.collapse": (p) => `Spaltengruppe ${p.path} zuklappen`,
  "rangeFilter.label": (p) => `Bereich für ${p.column}`,
  "rangeFilter.minimum": (p) => `Minimum für ${p.column}`,
  "rangeFilter.maximum": (p) => `Maximum für ${p.column}`,
  "rangeFilter.clear": (p) => `${p.column} leeren`,
  "builder.addConditionLabel": (p) => `Bedingung ${p.label} hinzufügen`,
  "builder.addGroupLabel": (p) =>
    `${logicName(p.kind)}-Gruppe ${p.label} hinzufügen`,
  "builder.columnLabel": (p) => `Spalte ${p.label}`,
  "builder.operatorLabel": (p) => `Operator ${p.label}`,
  "builder.valueLabel": (p) => `Wert ${p.label}`,
  "builder.upperLabel": (p) => `Oberer Wert ${p.label}`,
  "builder.setLabel": (p) => `Mengenwerte ${p.label}`,
  "builder.removeConditionLabel": (p) => `Bedingung ${p.label} entfernen`,
  "builder.negateLabel": (p) => `Bedingung ${p.label} mit NICHT verneinen`,
  "builder.matchLabel": (p) => `Verknüpfung ${p.label}`,
  "builder.removeGroupLabel": (p) => `Gruppe ${p.label} entfernen`,
  "builder.depthLimit": (p, f) =>
    `Ein Filter darf höchstens ${f.number(p.maximumDepth)} verschachtelte Ebenen enthalten`,
  "builder.notFilterable": (p) => `Spalte ${p.column} ist nicht filterbar`,
  "builder.valueRequired": (p) => `Geben Sie einen Wert für ${p.column} ein`,
  "builder.upperRequired": (p) =>
    `Geben Sie einen oberen Wert für ${p.column} ein`,
  "editor.loadError": (p) =>
    `Auswahlmöglichkeiten konnten nicht geladen werden: ${p.error}`,
  "rowEdit.title": (p) => `Zeile ${p.rowId} bearbeiten`,
  "rowEdit.fieldLabel": (p) => `${p.column} bearbeiten`,
  "note.forCell": (p) => `${p.column}, Zeile ${p.rowId}`,
  "note.editLabel": (p) =>
    `Notiz für ${p.column} in Zeile ${p.rowId} bearbeiten`,
  "remote.controls": (p) => `Steuerung für ${p.label}`,
  "remote.path": (p) => `Gruppenpfad für ${p.label}`,
  "remote.showColumn": (p) => `Serverspalte ${p.column} anzeigen`,
  "remote.pinColumn": (p) => `Serverspalte ${p.column} fixieren`,
  "remote.openGroup": (p) => `Gruppe ${p.group} öffnen`,
  "remote.routeCount": (p, f) => `${f.number(p.count)} Zeilen in diesem Pfad`,
  "remote.selected": (p, f) =>
    `${f.number(p.count)} auf dieser geladenen Seite ausgewählt`,
  "chart.seriesLabel": (p) => `Diagrammreihe ${p.column}`,
  "chart.repeatHelp": (p) =>
    `Wiederholte X-Werte werden mit ${aggregateName(p.operation)} zusammengefasst.`,
  "print.tableArea": (p) => `Scrollbereich der Tabelle ${p.title}`,
  "print.level": (p, f) => `Ebene ${f.number(p.level)}: ${p.value}`,
  "print.summary": (p, f) =>
    `${p.scope}. ${f.number(p.rows)} Zeilen, ${f.number(p.columns)} Spalten.`,
  "print.rowLimit": (p, f) =>
    `Der Druckumfang enthält ${f.number(p.count)} Zeilen und überschreitet maxRows ${f.number(p.limit)}. Wählen Sie einen kleineren Umfang oder erhöhen Sie die ausdrückliche Grenze.`,
  "print.cellLimit": (p, f) =>
    `Der Druckumfang benötigt einschließlich Überschriften ${f.number(p.count)} Tabellenzellen und überschreitet maxCells ${f.number(p.limit)}.`,
  "grid.help": (p) =>
    `Navigieren Sie mit den Pfeiltasten zwischen Zellen und mit Pos1 und Ende innerhalb einer Zeile. Strg+Pos1 und Strg+Ende führen zur ersten oder letzten Zelle. Eingabe oder F2 bearbeitet ${p.target}, Escape bricht ab und die Leertaste wählt eine Zeile aus. Umschalt+Klick auf Überschriften sortiert mehrere Spalten.`,
  "grid.helpEditRow": "die aktuelle Zeile in einem Dialog",
  "grid.helpEditCells": "bearbeitbare Zellen",
  "grid.rangeHelp":
    "Umschalt und Pfeiltasten erweitern einen Zellbereich. Strg oder Befehl+A wählt sichtbare Datenzellen, C kopiert und V fügt ein. Strg oder Befehl+D füllt nach unten, R nach rechts. Ziehen Sie die Bereichsecke zum Ausfüllen oder mit Alt zum Fortsetzen einer Zahlenreihe.",
  "grid.findHelp":
    "Strg oder Befehl+F öffnet die Suche in der aktuellen Ansicht.",
  "grid.noteHelp": "Alt+N öffnet die Notiz der aktuellen Zelle.",
  "grid.detailHelp":
    "Alt+Eingabe klappt die Details der aktuellen Zeile auf oder zu.",
  "grid.moveHelp":
    "Alt+Auf und Alt+Ab verschieben eine geeignete Zeile innerhalb der aktuellen Seite.",
  "rowEdit.help":
    "Änderungen bleiben in diesem Formular, bis Sie Zeile speichern wählen. Eingabe speichert die Zeile; verwenden Sie in mehrzeiligen Feldern Strg oder Befehl+Eingabe. Abbrechen verwirft den Entwurf.",
  "rowEdit.confirmReload":
    "Diesen Entwurf verwerfen und die aktuelle Zeile neu laden? Verworfene Entwurfswerte können nicht wiederhergestellt werden.",
  "note.context": (p) => `${p.column} · Zeile ${p.rowId}`,
  "headers.label": "Spaltengruppen",
  "builder.unavailableOperator": (p) =>
    `${p.operator} ist für ${p.column} nicht verfügbar`,
  "remote.liveCount": (p, f) => `${f.number(p.count)} Live-Zeilen`,
  "remote.loadingWindow": " – Ansichtsfenster wird geladen",
  "remote.readOnly": "Schreibgeschützter Datenanbieter",
  "chart.sourceSummary": (p, f) =>
    `${f.number(p.count)} Quellzeilen. ${f.number(p.shown)} von ${f.number(p.total)} ${p.kind} werden angezeigt.`,
  "chart.rowPoints": () => "Zeilenpunkte",
  "chart.categories": () => "Kategorien",
  "chart.sampling":
    "Eine gleichmäßige Stichprobe ist aktiv; zwischenliegende Extremwerte können fehlen.",
  "grid.row": "Zeile",
  "grid.column": "Spalte",
  "grid.spanHelp": (p) =>
    `Verbundene Zellen (${p.kind}) sind eingerichtet. Zellbereiche, Tabellenzwischenablage und Ausfüllen sind nicht verfügbar; Zeilenauswahl und Zellbearbeitung bleiben verfügbar.`,
  "grid.spanConflict":
    "Zeilen- und spaltenübergreifende Zellen können nicht in derselben Tabelle kombiniert werden",
  "grid.spanBudget":
    "Zeilenübergreifende Zellen unterstützen höchstens 100.000 sichtbare Zeilen und 8 aktive Spalten",
  "move.rowSpans":
    "Deaktivieren Sie vor dem Verschieben die zeilenübergreifenden Zellen",
  "grid.rowUpdated": "Zeile aktualisiert",
  "grid.findFailed": "Suche fehlgeschlagen",
  "grid.filterPlaceholder": "Filtern...",
  "grid.numberFilterPlaceholder": "= Wert",
  "grid.booleanAll": "Alle",
  "grid.booleanTrue": "Wahr",
  "grid.booleanFalse": "Falsch",
  "grid.sparkline": "Verlauf",
  "grid.fillHandle":
    "Zum Ausfüllen ziehen; Alt+Ziehen setzt eine Zahlenreihe fort",
  "grid.dragHelp":
    "Zum Verschieben ziehen; Alt+Auf oder Alt+Ab verschiebt um eine Zeile",
  "grid.rowMoveHelp":
    "Ziehen Sie einen Zeilengriff oder drücken Sie Alt+Auf oder Alt+Ab in einer Zelle. Zeilen bleiben innerhalb dieser Seite.",
  "grid.rowSpanHelp":
    "Zeilenübergreifende Zellen sind eingerichtet. Zellbereiche, Tabellenzwischenablage und Ausfüllen sind nicht verfügbar; Zeilenauswahl und Zellbearbeitung bleiben verfügbar.",
  "chart.xColumnLabel": "X-Spalte",
  "chart.aggregateLabel": "Aggregation",
  "chart.caption": "Angezeigte Diagrammwerte",
  "chart.captionSampled": "Angezeigte Diagrammwerte (gleichmäßige Stichprobe)",
  "chart.noSeries": "keine Zahlenreihen",
  "chart.category": "Kategorie",
  "chart.blank": "(leer)",
  "chart.typeBar": "Balken",
  "chart.typeLine": "Linien",
  "chart.typeScatter": "Punkt",
  "print.noColumns": "Keine sichtbaren Spalten zum Drucken.",
  "print.invalidScope": "Unbekannter Druckumfang",
  "builder.column": "Spalte",
  "builder.operator": "Operator",
  "builder.setValues": "Mengenwerte",
  "builder.value": "Wert",
  "builder.upper": "Oberer Wert",
  "builder.match": "Verknüpfung",
  "builder.root": "Wurzel",
  "builder.allConditions": "Alle Bedingungen (UND)",
  "builder.anyCondition": "Mindestens eine Bedingung (ODER)",
  "builder.negateLogic": "Verneinen (NICHT)",
  "builder.isoPlaceholder": "JJJJ-MM-TT",
  "remote.blankGroup": "(leer)",
  "remote.livePlaceholder": "Wird geladen...",
  "grid.booleanFilterColumn": (p) => `${p.column} filtern`,
  "chart.ySeries": (p, f) =>
    `Y-Reihen (${f.number(p.count)}/${f.number(p.limit)})`,
  "chart.dataTable": (p, f) =>
    `Diagrammdatentabelle (${f.number(p.count)} Zeilen)`,
  "chart.description": (p, f) =>
    `${p.type}-Diagramm für ${p.series} nach ${p.x}. ${f.number(p.count)} angezeigte Punkte. Die genauen angezeigten Werte folgen in einer Datentabelle.`,
  "print.createError": (p) =>
    `Druckmomentaufnahme konnte nicht erstellt werden: ${p.error}`,
  "print.invalidLimit": (p, f) =>
    `${p.name} muss eine ganze Zahl von 1 bis ${f.number(p.limit)} sein`,
  "builder.sourceDepthLimit": (p, f) =>
    `Dieser Filtereditor unterstützt höchstens ${f.number(p.maximumDepth)} Ebenen. Leeren Sie den Entwurf oder ersetzen Sie den Filter, um fortzufahren.`,
  "builder.addGroup": (p) => `${logicName(p.kind)}-Gruppe hinzufügen`,
  "builder.condition": (p) => `Bedingung ${p.label}`,
  "builder.group": (p) => `Gruppe ${p.label}`,
  "builder.unavailableColumn": (p) => `Nicht verfügbare Spalte: ${p.column}`,
  "note.help": (p, f) =>
    `Notizen sind reiner Text. Leere Notizen werden entfernt. ${f.number(p.current)} / ${f.number(p.maximum)} Zeichen.`,
  "remote.pivotCount": (p, f) =>
    `; ${f.number(p.count)} Server-Pivot-Ergebnisspalten verfügbar`,
  "remote.serverPage": (p, f) =>
    `Serverseite ${f.number(p.page)} von ${p.pages}`,
  "setList.values": "Werte",
  "setList.title": (p) => `Werte für ${p.column}`,
  "setList.help":
    "Die Auswahlmöglichkeiten stammen aus allen geladenen Zeilen. Die Suche schränkt nur die Auswahlmöglichkeiten ein. Änderungen bleiben bis Übernehmen vorbereitet. Andere Spalten-, Schnell- und erweiterte Filter bleiben mit diesem Filter verknüpft.",
  "setList.modelRequired":
    "Zur Werteauswahl wird ein Modell mit lokal vorhandenen Zeilen benötigt.",
  "setList.indexFailed":
    "Die Werteauswahl konnte nicht erstellt werden. Der angewendete Filter blieb erhalten.",
  "setList.readFailed":
    "Dieser Filter konnte innerhalb der unterstützten Grenzen nicht geprüft werden. Der angewendete Filter blieb erhalten.",
  "setList.applyFailed":
    "Diese Werte konnten nicht angewendet werden. Bearbeiten Sie weiter oder brechen Sie ab.",
  "setList.conflict":
    "Der angewendete Filter wurde während der Bearbeitung dieses Entwurfs geändert. Laden Sie den angewendeten Filter neu, um den Entwurf zu verwerfen, oder wählen Sie Abbrechen. Bis dahin ist Übernehmen nicht verfügbar.",
  "setList.unsupported":
    "Der angewendete Filter ist keine Werteliste. Leeren Sie ihn hier und wählen Sie Übernehmen, um ihn zu ersetzen, oder Abbrechen, um ihn beizubehalten.",
  "setList.removed": (p, f) =>
    `${f.number(p.count)} ausgewählte Werte sind aus der Quelle verschwunden. Prüfen Sie den Entwurf vor dem Übernehmen.`,
  "setList.search": "Werte suchen",
  "setList.searchLimit": "Die Suche ist auf 256 Zeichen begrenzt.",
  "setList.choices": "Werteauswahl",
  "setList.selectMatches": "Alle passenden Werte auswählen",
  "setList.blank": "(Leer oder ungültig)",
  "setList.entryCount": (p, f) => `(${f.number(p.count)} Zeilen)`,
  "setList.invalidHint": (p, f) =>
    `Enthält ${f.number(p.count)} für ihren Typ ungültige Werte`,
  "setList.empty": "Keine passenden Werte zur Auswahl",
  "setList.summary": (p, f) =>
    `${f.number(p.selected)} von ${f.number(p.total)} Werten aus ${f.number(p.rows)} lokal vorhandenen Zeilen ausgewählt`,
  "setList.pages": "Seiten der Werteauswahl",
  "setList.page": (p, f) =>
    `Seite ${f.number(p.page)} von ${f.number(p.pages)}`,
  "setList.reload": "Angewendeten Filter neu laden",
  "setList.apply": "Übernehmen",
  "setList.choiceIdentity": (p) => `${p.type}: ${p.value}`,
  "setList.typeBigInt": "Ganze Zahl",
  "setList.typeNumber": "Zahl",
  "setList.typeBoolean": "Wahrheitswert",
  "setList.typeText": "Text",
  "setList.typeDate": "Datum",
  "conditionFilter.title": (p) => `Bedingungen für ${p.column}`,
  "conditionFilter.help":
    "Legen Sie eine oder mehrere Bedingungen für diese Spalte fest. Änderungen werden beim Übernehmen gemeinsam angewendet.",
  "conditionFilter.logic": "Bedingungen verknüpfen",
  "rangeFilter.compound":
    "Diese Spalte hat verknüpfte Bedingungen. Löschen Sie diese vor der Eingabe eines Bereichs.",
  "conditionFilter.and": "Alle Bedingungen (UND)",
  "conditionFilter.or": "Mindestens eine Bedingung (ODER)",
  "conditionFilter.condition": (p, f) => `Bedingung ${f.number(p.index)}`,
  "conditionFilter.operator": (p, f) =>
    `Operator für Bedingung ${f.number(p.index)}`,
  "conditionFilter.value": (p, f) => `Wert für Bedingung ${f.number(p.index)}`,
  "conditionFilter.upper": (p, f) =>
    `Oberer Wert für Bedingung ${f.number(p.index)}`,
  "conditionFilter.calendar": (p, f) =>
    `UTC-Datum für Bedingung ${f.number(p.index)} auswählen`,
  "conditionFilter.dateHelp":
    "Kalenderauswahlen verwenden Mitternacht UTC. ISO-Zeitstempel behalten Zeit und Zeitzonenversatz bei. Verglichen werden Zeitpunkte.",
  "conditionFilter.membershipHelp":
    "Geben Sie ein JSON-Array von Werten ein. Schreiben Sie große ganze Zahlen für BigInt-Spalten als Zeichenketten; null wählt leere Werte aus.",
  "conditionFilter.add": "Bedingung hinzufügen",
  "conditionFilter.remove": (p, f) =>
    `Bedingung ${f.number(p.index)} entfernen`,
  "conditionFilter.apply": "Bedingungen anwenden",
  "conditionFilter.reload": "Aktuellen Filter neu laden",
  "conditionFilter.replace": "Durch neue Bedingungen ersetzen",
  "conditionFilter.conflict":
    "Der Spaltenfilter wurde geändert. Laden Sie ihn neu oder ersetzen Sie ihn ausdrücklich, bevor Sie Ihren Entwurf übernehmen.",
  "conditionFilter.unsupported":
    "Dieser Filter kann hier nicht bearbeitet werden. Behalten oder laden Sie ihn neu oder wählen Sie ausdrücklich Ersetzen oder Leeren.",
  "conditionFilter.invalid":
    "Geben Sie für jede Bedingung einen unterstützten Operator und gültige Werte ein.",
  "conditionFilter.limit":
    "Bedingungen sind auf 16 Zeilen, 10.000 Listenwerte und 256.000 Operandenzeichen begrenzt.",
  "conditionFilter.membership":
    "Geben Sie ein JSON-Array aus einfachen Werten ein. Große BigInt-Werte müssen als ganzzahlige Zeichenketten angegeben werden.",
  "conditionFilter.required": "Geben Sie einen Wert für diese Bedingung ein.",
  "conditionFilter.failed":
    "Diese Bedingungen konnten nicht angewendet werden.",
  "formula.mode": "Zelleingabemodus",
  "formula.literal": "Wert",
  "formula.formula": "Formel",
  "formula.modeHelp":
    "Wert speichert einen Wert. Formel wertet einen Ausdruck aus. Alt+M fokussiert die Modusauswahl; Eingabe führt von dort zum Eingabefeld zurück. Tab im Eingabefeld übernimmt die Zelle. Ein Moduswechsel erhält den Entwurfstext.",
  "grouping.panel": "Zeilengruppen",
  "grouping.drop": "Zum Gruppieren von Zeilen hierher ziehen",
  "grouping.choose": "Spalte zum Gruppieren",
  "grouping.allAdded": "Alle Spalten hinzugefügt",
  "grouping.add": "Gruppe hinzufügen",
  "grouping.grandTotal": "Gesamtsumme",
  "grouping.sort": (p) => `Gruppen nach ${p.column} sortieren`,
  "grouping.earlier": (p) => `Gruppierung ${p.column} nach vorne verschieben`,
  "grouping.later": (p) => `Gruppierung ${p.column} nach hinten verschieben`,
  "grouping.remove": (p) => `Gruppierung ${p.column} entfernen`,
  "grouping.total": (p) => `Summe ${p.group}`,
  "grouping.remoteControls": "Steuerung der Serverzweige",
  "grouping.remoteLabel": "Serverseitig gruppierte Zeilen",
  "grouping.remoteHint":
    "Klappen Sie mehrere Gruppen gleichzeitig auf. Jeder Zweig behält seine eigenen Seiten.",
  "grouping.remoteDepth": "Die maximale Aufklapptiefe beträgt 32 Ebenen.",
  "grouping.collapseAll": "Alle Zweige zuklappen",
  "grouping.loadMore": "Weitere Zeilen in diesem Zweig laden",
  "grouping.emptyBranch": "Keine Zeilen in diesem Zweig",
} satisfies GridMessages);
export const deDE: GridLocale = Object.freeze({
  id: "de-DE",
  messages: deMessages,
});
