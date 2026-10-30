/** OpenGrid-owned UI text. Headers, formatters and application/legacy error strings remain application-owned. */
export interface GridMessageParams {
  "columnMenu.open": { column: string };
  "columnMenu.title": { column: string };
  "columnMenu.sortAsc": undefined;
  "columnMenu.sortDesc": undefined;
  "columnMenu.sortClear": undefined;
  "columnMenu.unpin": undefined;
  "columnMenu.group": { column: string };
  "columnMenu.ungroup": { column: string };
  "columnMenu.hide": { column: string };
  "columnMenu.autoSize": undefined;
  "columnMenu.autoSizeRendered": undefined;
  "columnMenu.fit": undefined;
  "columnMenu.resetWidth": undefined;
  "columnMenu.filter": undefined;
  "columnMenu.chooser": undefined;
  "columnMenu.expand": undefined;
  "columnMenu.collapse": undefined;
  "columnMenu.unavailable": undefined;
  "columnMenu.sizingCancelled": undefined;
  "columnMenu.noSamples": undefined;
  "columnMenu.groupLimit": undefined;
  "columnMenu.applied": { column: string };
  "contextMenu.changed": undefined;
  "contextMenu.title": { column: string; rowId: string };
  "contextMenu.failed": undefined;
  "contextMenu.running": undefined;
  "contextMenu.copyCell": undefined;
  "multiFilter.title": { column: string };
  "multiFilter.help": undefined;
  "multiFilter.unreadable": undefined;
  "multiFilter.conflict": undefined;
  "multiFilter.failed": undefined;
  "multiFilter.unsupported": undefined;
  "multiFilter.reload": undefined;
  "multiFilter.keep": undefined;
  "multiFilter.replace": undefined;
  "multiFilter.child": { label: string };
  "multiFilter.childFailed": { label: string };
  "multiFilter.count": { count: number; total: number };
  "multiFilter.pending": undefined;
  "multiFilter.clearDraft": undefined;
  "multiFilter.apply": undefined;
  "hierarchy.changed": undefined;
  "hierarchy.unavailable": undefined;
  "hierarchy.selectSubtree": { label: string };
  "hierarchy.selectPage": undefined;
  "richSelect.open": { label: string };
  "richSelect.title": { label: string };
  "richSelect.search": { label: string };
  "richSelect.choices": { label: string };
  "richSelect.help": undefined;
  "richSelect.apply": undefined;
  "richSelect.noMatches": undefined;
  "richSelect.blank": undefined;
  "richSelect.count": { count: number };
  "richSelect.invalidOptions": undefined;
  "richSelect.unavailable": undefined;
  "richSelect.failed": undefined;
  "richSelect.changed": undefined;
  "richSelect.rejected": undefined;
  "richSelect.applying": undefined;
  "common.cancel": undefined;
  "common.clear": undefined;
  "common.remove": undefined;
  "common.close": undefined;
  "common.previous": undefined;
  "common.next": undefined;
  "common.true": undefined;
  "common.false": undefined;
  "common.none": undefined;
  "common.retry": undefined;
  "grid.ariaLabel": undefined;
  "grid.tools": undefined;
  "grid.searchLabel": undefined;
  "grid.searchPlaceholder": undefined;
  "grid.moveUp": undefined;
  "grid.moveDown": undefined;
  "grid.editRow": undefined;
  "grid.editFocusedCell": undefined;
  "grid.extendRange": undefined;
  "grid.extendRangeHelp": undefined;
  "grid.fillMode": undefined;
  "grid.fillCopy": undefined;
  "grid.fillSeries": undefined;
  "grid.touchHelp": undefined;
  "grid.touchMoveHelp": undefined;
  "grid.find": undefined;
  "grid.note": undefined;
  "grid.advancedFilter": undefined;
  "grid.copy": undefined;
  "grid.copyLabel": undefined;
  "grid.paste": undefined;
  "grid.pasteLabel": undefined;
  "grid.fillDown": undefined;
  "grid.fillDownLabel": undefined;
  "grid.undo": undefined;
  "grid.redo": undefined;
  "grid.undoRequested": undefined;
  "grid.redoRequested": undefined;
  "grid.exportCsv": undefined;
  "grid.columns": undefined;
  "grid.arrangeView": undefined;
  "grid.unpinned": undefined;
  "grid.pinLeft": undefined;
  "grid.pinRight": undefined;
  "grid.rowControls": undefined;
  "grid.selectPage": undefined;
  "grid.pinnedTop": undefined;
  "grid.pinnedBottom": undefined;
  "grid.empty": undefined;
  "grid.rowsPerPage": undefined;
  "grid.previousPage": undefined;
  "grid.nextPage": undefined;
  "grid.cellUpdated": undefined;
  "grid.changeUndone": undefined;
  "grid.changeRedone": undefined;
  "grid.noHistory": undefined;
  "grid.hiddenEditCancelled": undefined;
  "grid.columnSpanHelp": undefined;
  "find.label": undefined;
  "find.placeholder": undefined;
  "find.previous": undefined;
  "find.next": undefined;
  "find.close": undefined;
  "find.none": undefined;
  "move.unsupported": undefined;
  "move.disabled": undefined;
  "move.noColumns": undefined;
  "move.editing": undefined;
  "move.pins": undefined;
  "move.fullWidth": undefined;
  "move.details": undefined;
  "move.flat": undefined;
  "move.changed": undefined;
  "move.cancelled": undefined;
  "move.pageOnly": undefined;
  "move.failed": undefined;
  "move.first": undefined;
  "move.last": undefined;
  "move.foreign": undefined;
  "move.sorting": undefined;
  "move.filtering": undefined;
  "move.grouping": undefined;
  "move.tree": undefined;
  "move.externalFilter": undefined;
  "filter.all": undefined;
  "filter.contains": undefined;
  "filter.notContains": undefined;
  "filter.equals": undefined;
  "filter.notEqual": undefined;
  "filter.startsWith": undefined;
  "filter.endsWith": undefined;
  "filter.gt": undefined;
  "filter.gte": undefined;
  "filter.lt": undefined;
  "filter.lte": undefined;
  "filter.in": undefined;
  "filter.between": undefined;
  "filter.blank": undefined;
  "filter.notBlank": undefined;
  "filter.fromDate": undefined;
  "filter.toDate": undefined;
  "filter.min": undefined;
  "filter.max": undefined;
  "filter.chooseBoolean": undefined;
  "filter.invalidDate": undefined;
  "rangeFilter.notRange": undefined;
  "rangeFilter.compound": undefined;
  "rangeFilter.boundLimit": undefined;
  "rangeFilter.integer": undefined;
  "rangeFilter.iso": undefined;
  "rangeFilter.date": undefined;
  "rangeFilter.number": undefined;
  "rangeFilter.type": undefined;
  "rangeFilter.order": undefined;
  "rangeFilter.applyFailed": undefined;
  "rangeFilter.clearFailed": undefined;
  "builder.title": undefined;
  "builder.help": undefined;
  "builder.noColumns": undefined;
  "builder.empty": undefined;
  "builder.clear": undefined;
  "builder.apply": undefined;
  "builder.addCondition": undefined;
  "builder.and": undefined;
  "builder.or": undefined;
  "builder.not": undefined;
  "builder.negate": undefined;
  "builder.removeGroup": undefined;
  "builder.unsupported": undefined;
  "builder.readFailed": undefined;
  "builder.arraySyntax": undefined;
  "builder.arrayRequired": undefined;
  "builder.scalarValues": undefined;
  "builder.emptySet": undefined;
  "builder.bigIntJson": undefined;
  "builder.emptyGroup": undefined;
  "builder.applyFailed": undefined;
  "editor.choose": undefined;
  "editor.loading": undefined;
  "editor.retry": undefined;
  "editor.invalidChoices": undefined;
  "editor.loadFailed": undefined;
  "rowEdit.startFailed": undefined;
  "rowEdit.noFields": undefined;
  "rowEdit.saveFailed": undefined;
  "rowEdit.discardReload": undefined;
  "rowEdit.keepEditing": undefined;
  "rowEdit.reload": undefined;
  "rowEdit.save": undefined;
  "note.title": undefined;
  "note.text": undefined;
  "note.readFailed": undefined;
  "note.saveFailed": undefined;
  "note.delete": undefined;
  "note.save": undefined;
  "range.filled": undefined;
  "range.copied": undefined;
  "range.copyFailed": undefined;
  "range.pasted": undefined;
  "range.copyUnavailable": undefined;
  "range.pasteUnavailable": undefined;
  "range.writeFailed": undefined;
  "range.readFailed": undefined;
  "remote.serverLabel": undefined;
  "remote.liveLabel": undefined;
  "remote.allGroups": undefined;
  "remote.columns": undefined;
  "remote.loading": undefined;
  "remote.routePending": undefined;
  "remote.retryServer": undefined;
  "remote.previousPage": undefined;
  "remote.nextPage": undefined;
  "remote.countPending": undefined;
  "remote.retryLive": undefined;
  "remote.emptyLive": undefined;
  "chart.label": undefined;
  "chart.config": undefined;
  "chart.type": undefined;
  "chart.bar": undefined;
  "chart.line": undefined;
  "chart.scatter": undefined;
  "chart.xColumn": undefined;
  "chart.noColumns": undefined;
  "chart.aggregation": undefined;
  "chart.sum": undefined;
  "chart.average": undefined;
  "chart.series": undefined;
  "chart.export": undefined;
  "chart.exported": undefined;
  "chart.unavailable": undefined;
  "chart.rangeGone": undefined;
  "chart.scatterHelp": undefined;
  "chart.empty": undefined;
  "chart.legend": undefined;
  "print.title": undefined;
  "print.filtered": undefined;
  "print.view": undefined;
  "print.page": undefined;
  "print.selected": undefined;
  "print.all": undefined;
  "print.unknown": undefined;
  "print.buildFailed": undefined;
  "print.requested": undefined;
  "print.unavailable": undefined;
  "print.refreshed": undefined;
  "print.refresh": undefined;
  "print.print": undefined;
  "print.stale": undefined;
  "print.captured": undefined;
  "print.empty": undefined;
  "grid.showColumn": { column: string };
  "grid.pinColumn": { column: string };
  "grid.moveColumnLeft": { column: string };
  "grid.moveColumnRight": { column: string };
  "grid.sortColumn": { column: string };
  "grid.resizeColumn": { column: string };
  "grid.filterColumn": { column: string };
  "grid.editCell": { column: string; rowId: string };
  "grid.selectRow": { rowId: string };
  "grid.dragRow": { rowId: string };
  "grid.expandDetails": { rowId: string };
  "grid.collapseDetails": { rowId: string };
  "grid.details": { rowId: string };
  "grid.expandGroup": { group: string };
  "grid.collapseGroup": { group: string };
  "grid.rowCount": { count: number };
  "grid.selectedCount": { count: number };
  "grid.cellCount": { count: number };
  "grid.pageCount": { page: number; pages: number };
  "find.position": { position: number; count: number };
  "move.moved": { rowId: string; position: number };
  "move.moving": { rowId: string };
  "headers.expand": { path: string };
  "headers.collapse": { path: string };
  "rangeFilter.label": { column: string };
  "rangeFilter.minimum": { column: string };
  "rangeFilter.maximum": { column: string };
  "rangeFilter.clear": { column: string };
  "builder.addConditionLabel": { label: string };
  "builder.addGroupLabel": { kind: string; label: string };
  "builder.columnLabel": { label: string };
  "builder.operatorLabel": { label: string };
  "builder.valueLabel": { label: string };
  "builder.upperLabel": { label: string };
  "builder.setLabel": { label: string };
  "builder.removeConditionLabel": { label: string };
  "builder.negateLabel": { label: string };
  "builder.matchLabel": { label: string };
  "builder.removeGroupLabel": { label: string };
  "builder.depthLimit": { maximumDepth: number };
  "builder.notFilterable": { column: string };
  "builder.valueRequired": { column: string };
  "builder.upperRequired": { column: string };
  "editor.loadError": { error: string };
  "rowEdit.title": { rowId: string };
  "rowEdit.fieldLabel": { column: string };
  "note.forCell": { column: string; rowId: string };
  "note.editLabel": { column: string; rowId: string };
  "remote.controls": { label: string };
  "remote.path": { label: string };
  "remote.showColumn": { column: string };
  "remote.pinColumn": { column: string };
  "remote.openGroup": { group: string };
  "remote.routeCount": { count: number };
  "remote.selected": { count: number };
  "chart.seriesLabel": { column: string };
  "chart.repeatHelp": { operation: string };
  "print.tableArea": { title: string };
  "print.level": { level: number; value: string };
  "print.summary": { scope: string; rows: number; columns: number };
  "print.rowLimit": { count: number; limit: number };
  "print.cellLimit": { count: number; limit: number };
  "grid.help": { target: string };
  "grid.helpEditRow": undefined;
  "grid.helpEditCells": undefined;
  "grid.rangeHelp": undefined;
  "grid.findHelp": undefined;
  "grid.noteHelp": undefined;
  "grid.detailHelp": undefined;
  "grid.moveHelp": undefined;
  "rowEdit.help": undefined;
  "rowEdit.confirmReload": undefined;
  "note.context": { column: string; rowId: string };
  "headers.label": undefined;
  "builder.unavailableOperator": { operator: string; column: string };
  "remote.liveCount": { count: number };
  "remote.loadingWindow": undefined;
  "remote.readOnly": undefined;
  "chart.sourceSummary": {
    count: number;
    shown: number;
    total: number;
    kind: string;
  };
  "chart.rowPoints": { count: number };
  "chart.categories": { count: number };
  "chart.sampling": undefined;
  "grid.row": undefined;
  "grid.column": undefined;
  "grid.spanHelp": { kind: string };
  "grid.spanConflict": undefined;
  "grid.spanBudget": undefined;
  "move.rowSpans": undefined;
  "grid.rowUpdated": undefined;
  "grid.findFailed": undefined;
  "grid.filterPlaceholder": undefined;
  "grid.numberFilterPlaceholder": undefined;
  "grid.booleanAll": undefined;
  "grid.booleanTrue": undefined;
  "grid.booleanFalse": undefined;
  "grid.sparkline": undefined;
  "grid.fillHandle": undefined;
  "grid.dragHelp": undefined;
  "grid.rowMoveHelp": undefined;
  "grid.rowSpanHelp": undefined;
  "chart.xColumnLabel": undefined;
  "chart.aggregateLabel": undefined;
  "chart.caption": undefined;
  "chart.captionSampled": undefined;
  "chart.noSeries": undefined;
  "chart.category": undefined;
  "chart.blank": undefined;
  "chart.typeBar": undefined;
  "chart.typeLine": undefined;
  "chart.typeScatter": undefined;
  "print.noColumns": undefined;
  "print.invalidScope": undefined;
  "builder.column": undefined;
  "builder.operator": undefined;
  "builder.setValues": undefined;
  "builder.value": undefined;
  "builder.upper": undefined;
  "builder.match": undefined;
  "builder.root": undefined;
  "builder.allConditions": undefined;
  "builder.anyCondition": undefined;
  "builder.negateLogic": undefined;
  "builder.isoPlaceholder": undefined;
  "remote.blankGroup": undefined;
  "remote.livePlaceholder": undefined;
  "grid.booleanFilterColumn": { column: string };
  "chart.ySeries": { count: number; limit: number };
  "chart.dataTable": { count: number };
  "chart.description": {
    type: string;
    series: string;
    x: string;
    count: number;
  };
  "print.createError": { error: string };
  "print.invalidLimit": { name: string; limit: number };
  "builder.sourceDepthLimit": { maximumDepth: number };
  "builder.addGroup": { kind: string };
  "builder.condition": { label: string };
  "builder.group": { label: string };
  "builder.unavailableColumn": { column: string };
  "note.help": { current: number; maximum: number };
  "remote.pivotCount": { count: number };
  "remote.serverPage": { page: number; pages: string };
  "setList.values": undefined;
  "setList.title": { column: string };
  "setList.help": undefined;
  "setList.modelRequired": undefined;
  "setList.indexFailed": undefined;
  "setList.readFailed": undefined;
  "setList.applyFailed": undefined;
  "setList.conflict": undefined;
  "setList.unsupported": undefined;
  "setList.removed": { count: number };
  "setList.search": undefined;
  "setList.searchLimit": undefined;
  "setList.choices": undefined;
  "setList.selectMatches": undefined;
  "setList.blank": undefined;
  "setList.entryCount": { count: number };
  "setList.invalidHint": { count: number };
  "setList.empty": undefined;
  "setList.summary": { selected: number; total: number; rows: number };
  "setList.pages": undefined;
  "setList.page": { page: number; pages: number };
  "setList.reload": undefined;
  "setList.apply": undefined;
  "setList.choiceIdentity": { type: string; value: string };
  "setList.typeBigInt": undefined;
  "setList.typeNumber": undefined;
  "setList.typeBoolean": undefined;
  "setList.typeText": undefined;
  "setList.typeDate": undefined;
  "conditionFilter.title": { column: string };
  "conditionFilter.help": undefined;
  "conditionFilter.logic": undefined;
  "conditionFilter.and": undefined;
  "conditionFilter.or": undefined;
  "conditionFilter.condition": { index: number };
  "conditionFilter.operator": { index: number };
  "conditionFilter.value": { index: number };
  "conditionFilter.upper": { index: number };
  "conditionFilter.calendar": { index: number };
  "conditionFilter.dateHelp": undefined;
  "conditionFilter.membershipHelp": undefined;
  "conditionFilter.add": undefined;
  "conditionFilter.remove": { index: number };
  "conditionFilter.apply": undefined;
  "conditionFilter.reload": undefined;
  "conditionFilter.replace": undefined;
  "conditionFilter.conflict": undefined;
  "conditionFilter.unsupported": undefined;
  "conditionFilter.invalid": undefined;
  "conditionFilter.limit": undefined;
  "conditionFilter.membership": undefined;
  "conditionFilter.required": undefined;
  "conditionFilter.failed": undefined;
  "formula.mode": undefined;
  "formula.literal": undefined;
  "formula.formula": undefined;
  "formula.modeHelp": undefined;
}
export type GridMessageKey = keyof GridMessageParams;
export interface GridPluralForms {
  other: string;
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
}
export interface GridLocaleFormatters {
  number(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  plural(count: number, forms: Readonly<GridPluralForms>): string;
}
export type GridMessages = {
  readonly [K in GridMessageKey]: GridMessageParams[K] extends undefined
    ? string
    : (
        params: Readonly<GridMessageParams[K]>,
        format: GridLocaleFormatters,
      ) => string;
};
export type GridMessageOverrides = Partial<GridMessages>;
export interface GridLocale {
  readonly id: string;
  readonly messages: GridMessages;
}
export type GridMessage = {
  [K in GridMessageKey]: GridMessageParams[K] extends undefined
    ? Readonly<{ key: K; params?: undefined }>
    : Readonly<{ key: K; params: Readonly<GridMessageParams[K]> }>;
}[GridMessageKey];
export type GridMessageArgs<K extends GridMessageKey> =
  GridMessageParams[K] extends undefined
    ? []
    : [params: Readonly<GridMessageParams[K]>];
export const MESSAGE_PARAM_TYPES = Object.freeze({
  "columnMenu.open": { column: "string" },
  "columnMenu.title": { column: "string" },
  "columnMenu.sortAsc": {},
  "columnMenu.sortDesc": {},
  "columnMenu.sortClear": {},
  "columnMenu.unpin": {},
  "columnMenu.group": { column: "string" },
  "columnMenu.ungroup": { column: "string" },
  "columnMenu.hide": { column: "string" },
  "columnMenu.autoSize": {},
  "columnMenu.autoSizeRendered": {},
  "columnMenu.fit": {},
  "columnMenu.resetWidth": {},
  "columnMenu.filter": {},
  "columnMenu.chooser": {},
  "columnMenu.expand": {},
  "columnMenu.collapse": {},
  "columnMenu.unavailable": {},
  "columnMenu.sizingCancelled": {},
  "columnMenu.noSamples": {},
  "columnMenu.groupLimit": {},
  "columnMenu.applied": { column: "string" },
  "contextMenu.changed": {},
  "contextMenu.title": { column: "string", rowId: "string" },
  "contextMenu.failed": {},
  "contextMenu.running": {},
  "contextMenu.copyCell": {},
  "multiFilter.title": { column: "string" },
  "multiFilter.help": {},
  "multiFilter.unreadable": {},
  "multiFilter.conflict": {},
  "multiFilter.failed": {},
  "multiFilter.unsupported": {},
  "multiFilter.reload": {},
  "multiFilter.keep": {},
  "multiFilter.replace": {},
  "multiFilter.child": { label: "string" },
  "multiFilter.childFailed": { label: "string" },
  "multiFilter.count": { count: "number", total: "number" },
  "multiFilter.pending": {},
  "multiFilter.clearDraft": {},
  "multiFilter.apply": {},
  "hierarchy.changed": {},
  "hierarchy.unavailable": {},
  "hierarchy.selectSubtree": { label: "string" },
  "hierarchy.selectPage": {},
  "richSelect.open": { label: "string" },
  "richSelect.title": { label: "string" },
  "richSelect.search": { label: "string" },
  "richSelect.choices": { label: "string" },
  "richSelect.help": {},
  "richSelect.apply": {},
  "richSelect.noMatches": {},
  "richSelect.blank": {},
  "richSelect.count": { count: "number" },
  "richSelect.invalidOptions": {},
  "richSelect.unavailable": {},
  "richSelect.failed": {},
  "richSelect.changed": {},
  "richSelect.rejected": {},
  "richSelect.applying": {},
  "common.cancel": {},
  "common.clear": {},
  "common.remove": {},
  "common.close": {},
  "common.previous": {},
  "common.next": {},
  "common.true": {},
  "common.false": {},
  "common.none": {},
  "common.retry": {},
  "grid.ariaLabel": {},
  "grid.tools": {},
  "grid.searchLabel": {},
  "grid.searchPlaceholder": {},
  "grid.moveUp": {},
  "grid.moveDown": {},
  "grid.editRow": {},
  "grid.editFocusedCell": {},
  "grid.extendRange": {},
  "grid.extendRangeHelp": {},
  "grid.fillMode": {},
  "grid.fillCopy": {},
  "grid.fillSeries": {},
  "grid.touchHelp": {},
  "grid.touchMoveHelp": {},
  "grid.find": {},
  "grid.note": {},
  "grid.advancedFilter": {},
  "grid.copy": {},
  "grid.copyLabel": {},
  "grid.paste": {},
  "grid.pasteLabel": {},
  "grid.fillDown": {},
  "grid.fillDownLabel": {},
  "grid.undo": {},
  "grid.redo": {},
  "grid.undoRequested": {},
  "grid.redoRequested": {},
  "grid.exportCsv": {},
  "grid.columns": {},
  "grid.arrangeView": {},
  "grid.unpinned": {},
  "grid.pinLeft": {},
  "grid.pinRight": {},
  "grid.rowControls": {},
  "grid.selectPage": {},
  "grid.pinnedTop": {},
  "grid.pinnedBottom": {},
  "grid.empty": {},
  "grid.rowsPerPage": {},
  "grid.previousPage": {},
  "grid.nextPage": {},
  "grid.cellUpdated": {},
  "grid.changeUndone": {},
  "grid.changeRedone": {},
  "grid.noHistory": {},
  "grid.hiddenEditCancelled": {},
  "grid.columnSpanHelp": {},
  "find.label": {},
  "find.placeholder": {},
  "find.previous": {},
  "find.next": {},
  "find.close": {},
  "find.none": {},
  "move.unsupported": {},
  "move.disabled": {},
  "move.noColumns": {},
  "move.editing": {},
  "move.pins": {},
  "move.fullWidth": {},
  "move.details": {},
  "move.flat": {},
  "move.changed": {},
  "move.cancelled": {},
  "move.pageOnly": {},
  "move.failed": {},
  "move.first": {},
  "move.last": {},
  "move.foreign": {},
  "move.sorting": {},
  "move.filtering": {},
  "move.grouping": {},
  "move.tree": {},
  "move.externalFilter": {},
  "filter.all": {},
  "filter.contains": {},
  "filter.notContains": {},
  "filter.equals": {},
  "filter.notEqual": {},
  "filter.startsWith": {},
  "filter.endsWith": {},
  "filter.gt": {},
  "filter.gte": {},
  "filter.lt": {},
  "filter.lte": {},
  "filter.in": {},
  "filter.between": {},
  "filter.blank": {},
  "filter.notBlank": {},
  "filter.fromDate": {},
  "filter.toDate": {},
  "filter.min": {},
  "filter.max": {},
  "filter.chooseBoolean": {},
  "filter.invalidDate": {},
  "rangeFilter.notRange": {},
  "rangeFilter.compound": {},
  "rangeFilter.boundLimit": {},
  "rangeFilter.integer": {},
  "rangeFilter.iso": {},
  "rangeFilter.date": {},
  "rangeFilter.number": {},
  "rangeFilter.type": {},
  "rangeFilter.order": {},
  "rangeFilter.applyFailed": {},
  "rangeFilter.clearFailed": {},
  "builder.title": {},
  "builder.help": {},
  "builder.noColumns": {},
  "builder.empty": {},
  "builder.clear": {},
  "builder.apply": {},
  "builder.addCondition": {},
  "builder.and": {},
  "builder.or": {},
  "builder.not": {},
  "builder.negate": {},
  "builder.removeGroup": {},
  "builder.unsupported": {},
  "builder.readFailed": {},
  "builder.arraySyntax": {},
  "builder.arrayRequired": {},
  "builder.scalarValues": {},
  "builder.emptySet": {},
  "builder.bigIntJson": {},
  "builder.emptyGroup": {},
  "builder.applyFailed": {},
  "editor.choose": {},
  "editor.loading": {},
  "editor.retry": {},
  "editor.invalidChoices": {},
  "editor.loadFailed": {},
  "rowEdit.startFailed": {},
  "rowEdit.noFields": {},
  "rowEdit.saveFailed": {},
  "rowEdit.discardReload": {},
  "rowEdit.keepEditing": {},
  "rowEdit.reload": {},
  "rowEdit.save": {},
  "note.title": {},
  "note.text": {},
  "note.readFailed": {},
  "note.saveFailed": {},
  "note.delete": {},
  "note.save": {},
  "range.filled": {},
  "range.copied": {},
  "range.copyFailed": {},
  "range.pasted": {},
  "range.copyUnavailable": {},
  "range.pasteUnavailable": {},
  "range.writeFailed": {},
  "range.readFailed": {},
  "remote.serverLabel": {},
  "remote.liveLabel": {},
  "remote.allGroups": {},
  "remote.columns": {},
  "remote.loading": {},
  "remote.routePending": {},
  "remote.retryServer": {},
  "remote.previousPage": {},
  "remote.nextPage": {},
  "remote.countPending": {},
  "remote.retryLive": {},
  "remote.emptyLive": {},
  "chart.label": {},
  "chart.config": {},
  "chart.type": {},
  "chart.bar": {},
  "chart.line": {},
  "chart.scatter": {},
  "chart.xColumn": {},
  "chart.noColumns": {},
  "chart.aggregation": {},
  "chart.sum": {},
  "chart.average": {},
  "chart.series": {},
  "chart.export": {},
  "chart.exported": {},
  "chart.unavailable": {},
  "chart.rangeGone": {},
  "chart.scatterHelp": {},
  "chart.empty": {},
  "chart.legend": {},
  "print.title": {},
  "print.filtered": {},
  "print.view": {},
  "print.page": {},
  "print.selected": {},
  "print.all": {},
  "print.unknown": {},
  "print.buildFailed": {},
  "print.requested": {},
  "print.unavailable": {},
  "print.refreshed": {},
  "print.refresh": {},
  "print.print": {},
  "print.stale": {},
  "print.captured": {},
  "print.empty": {},
  "grid.showColumn": {
    column: "string",
  },
  "grid.pinColumn": {
    column: "string",
  },
  "grid.moveColumnLeft": {
    column: "string",
  },
  "grid.moveColumnRight": {
    column: "string",
  },
  "grid.sortColumn": {
    column: "string",
  },
  "grid.resizeColumn": {
    column: "string",
  },
  "grid.filterColumn": {
    column: "string",
  },
  "grid.editCell": {
    column: "string",
    rowId: "string",
  },
  "grid.selectRow": {
    rowId: "string",
  },
  "grid.dragRow": {
    rowId: "string",
  },
  "grid.expandDetails": {
    rowId: "string",
  },
  "grid.collapseDetails": {
    rowId: "string",
  },
  "grid.details": {
    rowId: "string",
  },
  "grid.expandGroup": {
    group: "string",
  },
  "grid.collapseGroup": {
    group: "string",
  },
  "grid.rowCount": {
    count: "number",
  },
  "grid.selectedCount": {
    count: "number",
  },
  "grid.cellCount": {
    count: "number",
  },
  "grid.pageCount": {
    page: "number",
    pages: "number",
  },
  "find.position": {
    position: "number",
    count: "number",
  },
  "move.moved": {
    rowId: "string",
    position: "number",
  },
  "move.moving": {
    rowId: "string",
  },
  "headers.expand": {
    path: "string",
  },
  "headers.collapse": {
    path: "string",
  },
  "rangeFilter.label": {
    column: "string",
  },
  "rangeFilter.minimum": {
    column: "string",
  },
  "rangeFilter.maximum": {
    column: "string",
  },
  "rangeFilter.clear": {
    column: "string",
  },
  "builder.addConditionLabel": {
    label: "string",
  },
  "builder.addGroupLabel": {
    kind: "string",
    label: "string",
  },
  "builder.columnLabel": {
    label: "string",
  },
  "builder.operatorLabel": {
    label: "string",
  },
  "builder.valueLabel": {
    label: "string",
  },
  "builder.upperLabel": {
    label: "string",
  },
  "builder.setLabel": {
    label: "string",
  },
  "builder.removeConditionLabel": {
    label: "string",
  },
  "builder.negateLabel": {
    label: "string",
  },
  "builder.matchLabel": {
    label: "string",
  },
  "builder.removeGroupLabel": {
    label: "string",
  },
  "builder.depthLimit": {
    maximumDepth: "number",
  },
  "builder.notFilterable": {
    column: "string",
  },
  "builder.valueRequired": {
    column: "string",
  },
  "builder.upperRequired": {
    column: "string",
  },
  "editor.loadError": {
    error: "string",
  },
  "rowEdit.title": {
    rowId: "string",
  },
  "rowEdit.fieldLabel": {
    column: "string",
  },
  "note.forCell": {
    column: "string",
    rowId: "string",
  },
  "note.editLabel": {
    column: "string",
    rowId: "string",
  },
  "remote.controls": {
    label: "string",
  },
  "remote.path": {
    label: "string",
  },
  "remote.showColumn": {
    column: "string",
  },
  "remote.pinColumn": {
    column: "string",
  },
  "remote.openGroup": {
    group: "string",
  },
  "remote.routeCount": {
    count: "number",
  },
  "remote.selected": {
    count: "number",
  },
  "chart.seriesLabel": {
    column: "string",
  },
  "chart.repeatHelp": {
    operation: "string",
  },
  "print.tableArea": {
    title: "string",
  },
  "print.level": {
    level: "number",
    value: "string",
  },
  "print.summary": {
    scope: "string",
    rows: "number",
    columns: "number",
  },
  "print.rowLimit": {
    count: "number",
    limit: "number",
  },
  "print.cellLimit": {
    count: "number",
    limit: "number",
  },
  "grid.help": {
    target: "string",
  },
  "grid.helpEditRow": {},
  "grid.helpEditCells": {},
  "grid.rangeHelp": {},
  "grid.findHelp": {},
  "grid.noteHelp": {},
  "grid.detailHelp": {},
  "grid.moveHelp": {},
  "rowEdit.help": {},
  "rowEdit.confirmReload": {},
  "note.context": {
    column: "string",
    rowId: "string",
  },
  "headers.label": {},
  "builder.unavailableOperator": {
    operator: "string",
    column: "string",
  },
  "remote.liveCount": {
    count: "number",
  },
  "remote.loadingWindow": {},
  "remote.readOnly": {},
  "chart.sourceSummary": {
    count: "number",
    shown: "number",
    total: "number",
    kind: "string",
  },
  "chart.rowPoints": {
    count: "number",
  },
  "chart.categories": {
    count: "number",
  },
  "chart.sampling": {},
  "grid.row": {},
  "grid.column": {},
  "grid.spanHelp": {
    kind: "string",
  },
  "grid.spanConflict": {},
  "grid.spanBudget": {},
  "move.rowSpans": {},
  "grid.rowUpdated": {},
  "grid.findFailed": {},
  "grid.filterPlaceholder": {},
  "grid.numberFilterPlaceholder": {},
  "grid.booleanAll": {},
  "grid.booleanTrue": {},
  "grid.booleanFalse": {},
  "grid.sparkline": {},
  "grid.fillHandle": {},
  "grid.dragHelp": {},
  "grid.rowMoveHelp": {},
  "grid.rowSpanHelp": {},
  "chart.xColumnLabel": {},
  "chart.aggregateLabel": {},
  "chart.caption": {},
  "chart.captionSampled": {},
  "chart.noSeries": {},
  "chart.category": {},
  "chart.blank": {},
  "chart.typeBar": {},
  "chart.typeLine": {},
  "chart.typeScatter": {},
  "print.noColumns": {},
  "print.invalidScope": {},
  "builder.column": {},
  "builder.operator": {},
  "builder.setValues": {},
  "builder.value": {},
  "builder.upper": {},
  "builder.match": {},
  "builder.root": {},
  "builder.allConditions": {},
  "builder.anyCondition": {},
  "builder.negateLogic": {},
  "builder.isoPlaceholder": {},
  "remote.blankGroup": {},
  "remote.livePlaceholder": {},
  "grid.booleanFilterColumn": {
    column: "string",
  },
  "chart.ySeries": {
    count: "number",
    limit: "number",
  },
  "chart.dataTable": {
    count: "number",
  },
  "chart.description": {
    type: "string",
    series: "string",
    x: "string",
    count: "number",
  },
  "print.createError": {
    error: "string",
  },
  "print.invalidLimit": {
    name: "string",
    limit: "number",
  },
  "builder.sourceDepthLimit": {
    maximumDepth: "number",
  },
  "builder.addGroup": {
    kind: "string",
  },
  "builder.condition": {
    label: "string",
  },
  "builder.group": {
    label: "string",
  },
  "builder.unavailableColumn": {
    column: "string",
  },
  "note.help": {
    current: "number",
    maximum: "number",
  },
  "remote.pivotCount": {
    count: "number",
  },
  "remote.serverPage": {
    page: "number",
    pages: "string",
  },
  "setList.values": {},
  "setList.title": { column: "string" },
  "setList.help": {},
  "setList.modelRequired": {},
  "setList.indexFailed": {},
  "setList.readFailed": {},
  "setList.applyFailed": {},
  "setList.conflict": {},
  "setList.unsupported": {},
  "setList.removed": { count: "number" },
  "setList.search": {},
  "setList.searchLimit": {},
  "setList.choices": {},
  "setList.selectMatches": {},
  "setList.blank": {},
  "setList.entryCount": { count: "number" },
  "setList.invalidHint": { count: "number" },
  "setList.empty": {},
  "setList.summary": { selected: "number", total: "number", rows: "number" },
  "setList.pages": {},
  "setList.page": { page: "number", pages: "number" },
  "setList.reload": {},
  "setList.apply": {},
  "setList.choiceIdentity": { type: "string", value: "string" },
  "setList.typeBigInt": {},
  "setList.typeNumber": {},
  "setList.typeBoolean": {},
  "setList.typeText": {},
  "setList.typeDate": {},
  "conditionFilter.title": { column: "string" },
  "conditionFilter.help": {},
  "conditionFilter.logic": {},
  "conditionFilter.and": {},
  "conditionFilter.or": {},
  "conditionFilter.condition": { index: "number" },
  "conditionFilter.operator": { index: "number" },
  "conditionFilter.value": { index: "number" },
  "conditionFilter.upper": { index: "number" },
  "conditionFilter.calendar": { index: "number" },
  "conditionFilter.dateHelp": {},
  "conditionFilter.membershipHelp": {},
  "conditionFilter.add": {},
  "conditionFilter.remove": { index: "number" },
  "conditionFilter.apply": {},
  "conditionFilter.reload": {},
  "conditionFilter.replace": {},
  "conditionFilter.conflict": {},
  "conditionFilter.unsupported": {},
  "conditionFilter.invalid": {},
  "conditionFilter.limit": {},
  "conditionFilter.membership": {},
  "conditionFilter.required": {},
  "conditionFilter.failed": {},
  "formula.mode": {},
  "formula.literal": {},
  "formula.formula": {},
  "formula.modeHelp": {},
});
for (const fields of Object.values(MESSAGE_PARAM_TYPES)) Object.freeze(fields);
