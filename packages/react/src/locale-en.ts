import type { GridLocale, GridMessages } from "./locale-messages.js";
export const enMessages = Object.freeze({
  "columnMenu.open": (params, _format) => `Column menu for ${params.column}`,
  "columnMenu.title": (params, _format) =>
    `Column commands for ${params.column}`,
  "columnMenu.sortAsc": "Sort ascending",
  "columnMenu.sortDesc": "Sort descending",
  "columnMenu.sortClear": "Clear this sort",
  "columnMenu.unpin": "Unpin column",
  "columnMenu.group": (params, _format) => `Group by ${params.column}`,
  "columnMenu.ungroup": (params, _format) => `Remove ${params.column} grouping`,
  "columnMenu.hide": (params, _format) => `Hide ${params.column}`,
  "columnMenu.autoSize": "Size this column",
  "columnMenu.autoSizeRendered": "Size rendered columns",
  "columnMenu.fit": "Fit columns to grid",
  "columnMenu.resetWidth": "Reset this width",
  "columnMenu.filter": "Focus column filter",
  "columnMenu.chooser": "Choose columns",
  "columnMenu.expand": "Expand groups",
  "columnMenu.collapse": "Collapse groups",
  "columnMenu.unavailable": "The column command is temporarily unavailable.",
  "columnMenu.sizingCancelled": "Column sizing was cancelled. Try again.",
  "columnMenu.noSamples": "No rendered default text is available to measure.",
  "columnMenu.groupLimit": "This hierarchy exceeds the menu expansion limit.",
  "columnMenu.applied": (params, _format) =>
    `Column command applied to ${params.column}`,
  "contextMenu.changed":
    "The grid changed while preparing the menu. Open it again.",
  "contextMenu.title": (params, _format) =>
    `Commands for ${params.column}, row ${params.rowId}`,
  "contextMenu.failed": "Unable to complete the menu command.",
  "contextMenu.running": "Running command…",
  "contextMenu.copyCell": "Copy cell",
  "multiFilter.title": (params, _format) =>
    `Combined filters for ${params.column}`,
  "multiFilter.help":
    "Apply settings in each child filter, then apply the combined filter. All active children must match.",
  "multiFilter.unreadable":
    "Unable to read the applied filter. Reload it before applying changes.",
  "multiFilter.conflict":
    "The applied filter changed. Reload it or explicitly keep your staged filters.",
  "multiFilter.failed": "Unable to apply the combined filter.",
  "multiFilter.unsupported":
    "These child filters cannot edit the current settings. Starting new filters discards those settings only when you apply.",
  "multiFilter.reload": "Reload applied filters",
  "multiFilter.keep": "Keep staged filters",
  "multiFilter.replace": "Start new child filters",
  "multiFilter.child": (params, _format) => `Edit ${params.label}`,
  "multiFilter.childFailed": (params, _format) =>
    `${params.label} could not be staged. Correct or clear its settings.`,
  "multiFilter.count": (params, format) =>
    `${format.number(params.count)} of ${format.number(params.total)} active`,
  "multiFilter.pending": "Staged changes are pending.",
  "multiFilter.clearDraft": "Clear staged filters",
  "multiFilter.apply": "Apply combined filter",
  "hierarchy.changed": "The row hierarchy changed. Try selection again.",
  "hierarchy.unavailable": "Hierarchy selection is unavailable.",
  "hierarchy.selectSubtree": (params, _format) =>
    `Select subtree ${params.label}`,
  "hierarchy.selectPage": "Select page subtrees",
  "richSelect.open": (params, _format) => `Choose ${params.label}`,
  "richSelect.title": (params, _format) => `Choose ${params.label}`,
  "richSelect.search": (params, _format) => `Search ${params.label} choices`,
  "richSelect.choices": (params, _format) => `${params.label} choices`,
  "richSelect.help":
    "Search or use the arrow keys to choose. Enter or Apply saves the choice; Escape cancels.",
  "richSelect.apply": "Apply choice",
  "richSelect.noMatches": "No matching choices",
  "richSelect.blank": "(blank)",
  "richSelect.count": (params, format) =>
    `${format.number(params.count)} ${params.count === 1 ? "choice" : "choices"}`,
  "richSelect.invalidOptions":
    "The choice list is invalid or exceeds supported limits.",
  "richSelect.unavailable":
    "The current choice is unavailable. Choose a listed value to continue.",
  "richSelect.failed": "The choice could not be applied.",
  "richSelect.changed": "Choices changed. Choose an available value again.",
  "richSelect.rejected": "This choice could not be applied.",
  "richSelect.applying": "Applying choice…",
  "common.cancel": "Cancel",
  "common.clear": "Clear",
  "common.remove": "Remove",
  "common.close": "Close",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.true": "True",
  "common.false": "False",
  "common.none": "(none)",
  "common.retry": "Retry",
  "grid.ariaLabel": "Data grid",
  "grid.tools": "Grid tools",
  "grid.searchLabel": "Search all rows",
  "grid.searchPlaceholder": "Search all rows...",
  "grid.moveUp": "Move focused row up",
  "grid.moveDown": "Move focused row down",
  "grid.editRow": "Edit row",
  "grid.editFocusedCell": "Edit cell",
  "grid.extendRange": "Extend range",
  "grid.extendRangeHelp":
    "Tap a cell to extend the current range. You can scroll before choosing the endpoint.",
  "grid.fillMode": "Fill mode",
  "grid.fillCopy": "Copy values",
  "grid.fillSeries": "Extend numeric series",
  "grid.touchHelp":
    "Tap to focus a cell. Double-tap an editable cell or use Edit cell. Scroll or pinch to navigate the grid.",
  "grid.touchMoveHelp":
    "On touch screens, use Move focused row up or down to reorder rows.",
  "grid.find": "Find",
  "grid.note": "Note",
  "grid.advancedFilter": "Advanced filter",
  "grid.copy": "Copy",
  "grid.copyLabel": "Copy selected cells",
  "grid.paste": "Paste",
  "grid.pasteLabel": "Paste cells",
  "grid.fillDown": "Fill down",
  "grid.fillDownLabel": "Fill down selected cells",
  "grid.undo": "Undo",
  "grid.redo": "Redo",
  "grid.undoRequested": "Undo requested",
  "grid.redoRequested": "Redo requested",
  "grid.exportCsv": "Export CSV",
  "grid.columns": "Columns",
  "grid.arrangeView": "Arrange your view",
  "grid.unpinned": "Unpinned",
  "grid.pinLeft": "Pin left",
  "grid.pinRight": "Pin right",
  "grid.rowControls": "Row controls",
  "grid.selectPage": "Select all rows on page",
  "grid.pinnedTop": "Pinned top rows",
  "grid.pinnedBottom": "Pinned bottom rows",
  "grid.noColumns": "No visible columns",
  "grid.empty": "No matching rows",
  "grid.rowsPerPage": "Rows per page",
  "grid.previousPage": "Previous page",
  "grid.nextPage": "Next page",
  "grid.cellUpdated": "Cell updated",
  "grid.changeUndone": "Change undone",
  "grid.changeRedone": "Change redone",
  "grid.noHistory": "No edits to restore",
  "grid.hiddenEditCancelled":
    "Editing cancelled because the cell is no longer visible",
  "grid.columnSpanHelp":
    "Column spanning is configured. Cell ranges, grid clipboard and fill are unavailable; row selection and cell editing remain available.",
  "find.label": "Find in current view",
  "find.placeholder": "Find without filtering rows",
  "find.previous": "Previous find match",
  "find.next": "Next find match",
  "find.close": "Close find",
  "find.none": "No matches",
  "move.unsupported": "This data source does not support managed row moves",
  "move.disabled": "Row moving is not enabled",
  "move.noColumns": "Show a data column before moving rows",
  "move.editing": "Finish or cancel editing before moving rows",
  "move.pins": "Remove pinned rows from this view before moving rows",
  "move.fullWidth": "Turn off full-width rows in this view before moving rows",
  "move.details": "Close detail panels before moving rows",
  "move.flat": "Managed row moves require ordinary flat rows",
  "move.changed": "The row view changed. Start the move again.",
  "move.cancelled": "Row move cancelled",
  "move.pageOnly": "Moves must stay within the current page",
  "move.failed": "Unable to move this row",
  "move.first": "Row is already first on this page",
  "move.last": "Row is already last on this page",
  "move.foreign": "Only a row dragged from this grid can be moved here",
  "move.sorting": "Clear sorting before reordering rows",
  "move.filtering": "Clear filters before reordering rows",
  "move.grouping": "Clear grouping before reordering rows",
  "move.tree": "Row reordering is unavailable for tree data",
  "move.externalFilter": "Clear the external filter before reordering rows",
  "filter.all": "All",
  "filter.contains": "Contains",
  "filter.notContains": "Does not contain",
  "filter.equals": "Equals",
  "filter.notEqual": "Does not equal",
  "filter.startsWith": "Starts with",
  "filter.endsWith": "Ends with",
  "filter.gt": "Greater than",
  "filter.gte": "Greater than or equal",
  "filter.lt": "Less than",
  "filter.lte": "Less than or equal",
  "filter.in": "Is one of",
  "filter.between": "Between",
  "filter.blank": "Is blank",
  "filter.notBlank": "Is not blank",
  "filter.fromDate": "From date",
  "filter.toDate": "To date",
  "filter.min": "Min",
  "filter.max": "Max",
  "filter.chooseBoolean": "Choose a boolean",
  "filter.invalidDate": "Invalid Date",
  "rangeFilter.notRange":
    "The current filter is not an inclusive range. Change a bound or clear it to replace that filter.",
  "rangeFilter.boundLimit": "Each range bound is limited to 256 characters",
  "rangeFilter.integer": "Enter a complete integer for each BigInt bound",
  "rangeFilter.iso": "Use an ISO date or timestamp for each date bound",
  "rangeFilter.date": "Enter a valid calendar date for each date bound",
  "rangeFilter.number": "Enter a complete finite number for each range bound",
  "rangeFilter.type":
    "This range filter supports number, BigInt and date columns",
  "rangeFilter.order": "The minimum must not exceed the maximum",
  "rangeFilter.applyFailed": "Unable to apply this range",
  "rangeFilter.clearFailed": "Unable to clear this range",
  "builder.title": "Advanced filter",
  "builder.help":
    "Build nested conditions with AND, OR and NOT. Sets accept a JSON array or one value per line. Quote large integers in JSON. Changes take effect when you apply.",
  "builder.noColumns": "No filterable columns",
  "builder.empty": "No advanced filter",
  "builder.clear": "Clear draft",
  "builder.apply": "Apply filter",
  "builder.addCondition": "Add condition",
  "builder.and": "AND",
  "builder.or": "OR",
  "builder.not": "NOT",
  "builder.negate": "Negate condition",
  "builder.removeGroup": "Remove group",
  "builder.unsupported": "Unsupported advanced filter expression",
  "builder.readFailed": "Cannot read this filter",
  "builder.arraySyntax":
    "Set values must be a valid JSON array or one value per line",
  "builder.arrayRequired": "Set values must be a JSON array",
  "builder.scalarValues":
    "Set values must contain only strings, numbers, booleans or null",
  "builder.emptySet": "Enter at least one set value",
  "builder.bigIntJson":
    "Use quoted strings for large BigInt values in JSON arrays",
  "builder.emptyGroup": "Each AND or OR group needs at least one condition",
  "builder.applyFailed": "Unable to apply this filter",
  "editor.choose": "Choose a value",
  "editor.loading": "Loading choices...",
  "editor.retry": "Retry choices",
  "editor.invalidChoices": "Options provider returned invalid choices",
  "editor.loadFailed": "Unable to load choices",
  "rowEdit.startFailed": "Unable to start row editing",
  "rowEdit.noFields": "This row has no editable visible fields",
  "rowEdit.saveFailed": "Unable to save this row",
  "rowEdit.discardReload": "Discard draft and reload",
  "rowEdit.keepEditing": "Keep editing",
  "rowEdit.reload": "Reload row",
  "rowEdit.save": "Save row",
  "note.title": "Cell note",
  "note.text": "Note text",
  "note.readFailed": "Unable to read this note",
  "note.saveFailed": "Unable to save this note",
  "note.delete": "Delete note",
  "note.save": "Save note",
  "range.filled": "Range filled. Undo restores the previous values.",
  "range.copied": "Selected cells copied.",
  "range.copyFailed": "Unable to copy cells",
  "range.pasted": "Cells pasted. Undo restores the previous values.",
  "range.copyUnavailable":
    "Clipboard access is unavailable. Use the copy keyboard shortcut.",
  "range.pasteUnavailable":
    "Clipboard access is unavailable. Use the paste keyboard shortcut.",
  "range.writeFailed": "Clipboard write failed",
  "range.readFailed": "Clipboard read failed",
  "remote.serverLabel": "Server data grid",
  "remote.liveLabel": "Live viewport data grid",
  "remote.infiniteLabel": "Infinite data grid",
  "remote.infiniteCount": (params, format) =>
    `${format.number(params.count)} rows`,
  "remote.retryInfinite": "Retry infinite rows",
  "remote.emptyInfinite": "No rows",
  "remote.allGroups": "All groups",
  "remote.columns": "Server columns",
  "remote.loading": "Loading server rows... ",
  "remote.routePending": "Route count pending",
  "remote.retryServer": "Retry server rows",
  "remote.previousPage": "Previous server page",
  "remote.nextPage": "Next server page",
  "remote.countPending": "Remote row count pending",
  "remote.retryLive": "Retry live rows",
  "remote.emptyLive": "No live rows",
  "chart.label": "Grid chart",
  "chart.config": "Chart configuration",
  "chart.type": "Chart type",
  "chart.bar": "Bar",
  "chart.line": "Line",
  "chart.scatter": "Scatter",
  "chart.xColumn": "Chart X column",
  "chart.noColumns": "No columns",
  "chart.aggregation": "Chart aggregation",
  "chart.sum": "Sum",
  "chart.average": "Average",
  "chart.series": "Numeric series",
  "chart.export": "Export chart SVG",
  "chart.exported": "Chart SVG exported",
  "chart.unavailable": "Chart export is unavailable in this browser",
  "chart.rangeGone": "The selected range is no longer visible.",
  "chart.scatterHelp": "Scatter uses numeric X values.",
  "chart.empty": "No finite numeric values to chart",
  "chart.legend": "Chart legend",
  "print.title": "Grid print view",
  "print.filtered": "Sorted and filtered rows",
  "print.view": "Expanded group/tree view",
  "print.page": "Current page",
  "print.selected": "Selected rows in current filtered results",
  "print.all": "All source rows (input order)",
  "print.unknown": "Unknown scope",
  "print.buildFailed": "Unable to build print snapshot",
  "print.requested":
    "Print dialog requested. Browser settings control the final output.",
  "print.unavailable": "Printing is unavailable in this browser.",
  "print.refreshed": "Snapshot refreshed.",
  "print.refresh": "Refresh print snapshot",
  "print.print": "Print snapshot",
  "print.stale": "Grid changed; refresh the snapshot before printing.",
  "print.captured": "Captured snapshot; later changes do not alter its values.",
  "print.empty": "No rows in this print scope.",
  "grid.showColumn": (params, _format) => `Show ${params.column}`,
  "grid.pinColumn": (params, _format) => `Pin ${params.column}`,
  "grid.moveColumnLeft": (params, _format) => `Move ${params.column} left`,
  "grid.moveColumnRight": (params, _format) => `Move ${params.column} right`,
  "grid.sortColumn": (params, _format) => `Sort ${params.column}`,
  "grid.resizeColumn": (params, _format) => `Resize ${params.column}`,
  "grid.filterColumn": (params, _format) => `Filter ${params.column}`,
  "grid.editCell": (params, _format) =>
    `Edit ${params.column} row ${params.rowId}`,
  "grid.selectRow": (params, _format) => `Select row ${params.rowId}`,
  "grid.dragRow": (params, _format) => `Drag row ${params.rowId}`,
  "grid.expandDetails": (params, _format) =>
    `Expand details row ${params.rowId}`,
  "grid.collapseDetails": (params, _format) =>
    `Collapse details row ${params.rowId}`,
  "grid.details": (params, _format) => `Details for row ${params.rowId}`,
  "grid.expandGroup": (params, _format) => `Expand ${params.group}`,
  "grid.collapseGroup": (params, _format) => `Collapse ${params.group}`,
  "grid.rowCount": (params, _format) => `${_format.number(params.count)} rows`,
  "grid.selectedCount": (params, _format) =>
    `${_format.number(params.count)} selected`,
  "grid.cellCount": (params, _format) =>
    `${_format.number(params.count)} cells selected`,
  "grid.pageCount": (params, _format) =>
    `Page ${_format.number(params.page)} of ${_format.number(params.pages)}`,
  "find.position": (params, _format) =>
    `${_format.number(params.position)} of ${_format.number(params.count)}`,
  "move.moved": (params, _format) =>
    `Row ${params.rowId} moved to position ${_format.number(params.position)} on this page`,
  "move.moving": (params, _format) =>
    `Moving row ${params.rowId}. Drop before or after another row on this page.`,
  "headers.expand": (params, _format) => `Expand column group ${params.path}`,
  "headers.collapse": (params, _format) =>
    `Collapse column group ${params.path}`,
  "rangeFilter.label": (params, _format) => `${params.column} range`,
  "rangeFilter.minimum": (params, _format) => `${params.column} minimum`,
  "rangeFilter.maximum": (params, _format) => `${params.column} maximum`,
  "rangeFilter.clear": (params, _format) => `Clear ${params.column}`,
  "builder.addConditionLabel": (params, _format) =>
    `Add condition ${params.label}`,
  "builder.addGroupLabel": (params, _format) =>
    `Add ${params.kind} group ${params.label}`,
  "builder.columnLabel": (params, _format) => `Column ${params.label}`,
  "builder.operatorLabel": (params, _format) => `Operator ${params.label}`,
  "builder.valueLabel": (params, _format) => `Value ${params.label}`,
  "builder.upperLabel": (params, _format) => `Upper value ${params.label}`,
  "builder.setLabel": (params, _format) => `Set values ${params.label}`,
  "builder.removeConditionLabel": (params, _format) =>
    `Remove condition ${params.label}`,
  "builder.negateLabel": (params, _format) =>
    `Wrap condition ${params.label} in NOT`,
  "builder.matchLabel": (params, _format) => `Match ${params.label}`,
  "builder.removeGroupLabel": (params, _format) =>
    `Remove group ${params.label}`,
  "builder.depthLimit": (params, _format) =>
    `A filter can have at most ${_format.number(params.maximumDepth)} nested levels`,
  "builder.notFilterable": (params, _format) =>
    `Column ${params.column} is not filterable`,
  "builder.valueRequired": (params, _format) =>
    `Enter a value for ${params.column}`,
  "builder.upperRequired": (params, _format) =>
    `Enter an upper value for ${params.column}`,
  "editor.loadError": (params, _format) =>
    `Could not load choices: ${params.error}`,
  "rowEdit.title": (params, _format) => `Edit row ${params.rowId}`,
  "rowEdit.fieldLabel": (params, _format) => `Edit ${params.column}`,
  "note.forCell": (params, _format) => `${params.column}, row ${params.rowId}`,
  "note.editLabel": (params, _format) =>
    `Edit note for ${params.column} row ${params.rowId}`,
  "remote.controls": (params, _format) => `${params.label} controls`,
  "remote.path": (params, _format) => `${params.label} group path`,
  "remote.showColumn": (params, _format) => `Show server ${params.column}`,
  "remote.pinColumn": (params, _format) => `Pin server ${params.column}`,
  "remote.openGroup": (params, _format) => `Open group ${params.group}`,
  "remote.routeCount": (params, _format) =>
    `${_format.number(params.count)} rows at this route`,
  "remote.selected": (params, _format) =>
    `${_format.number(params.count)} selected on this loaded page`,
  "chart.seriesLabel": (params, _format) => `Chart series ${params.column}`,
  "chart.repeatHelp": (params, _format) =>
    `Repeated X values use ${params.operation}.`,
  "print.tableArea": (params, _format) => `${params.title} table scroll area`,
  "print.level": (params, _format) =>
    `Level ${_format.number(params.level)}: ${params.value}`,
  "print.summary": (params, _format) =>
    `${params.scope}. ${_format.number(params.rows)} rows, ${_format.number(params.columns)} columns.`,
  "print.rowLimit": (params, _format) =>
    `Print scope has ${_format.number(params.count)} rows, exceeding maxRows ${_format.number(params.limit)}. Choose a smaller scope or raise the explicit limit.`,
  "print.cellLimit": (params, _format) =>
    `Print scope needs ${_format.number(params.count)} table cells including headers, exceeding maxCells ${_format.number(params.limit)}.`,
  "grid.help": (params, _format) =>
    `Use arrow keys to navigate cells, Home and End to move across a row, Control Home and End to reach the first or last cell. Press Enter or F2 to edit ${params.target}, Escape to cancel, Space to select a row. Shift click headers for multiple sort columns.`,
  "grid.helpEditRow": "the current row in a dialog",
  "grid.helpEditCells": "editable cells",
  "grid.rangeHelp":
    "Shift and arrow keys extend a cell range. Control or Command A selects visible data cells; C copies and V pastes. Control or Command D fills down, R fills right. Drag the range corner to fill, or Alt-drag to extend a numeric series.",
  "grid.findHelp": "Control or Command F opens Find in the current view.",
  "grid.noteHelp": "Alt N opens the current cell note.",
  "grid.detailHelp": "Alt Enter expands or collapses the current row detail.",
  "grid.moveHelp":
    "Alt+Up and Alt+Down move an eligible row within the current page.",
  "rowEdit.help":
    "Changes stay in this form until Save row. Enter saves the row; in multiline fields use Control or Command Enter. Cancel discards the draft.",
  "rowEdit.confirmReload":
    "Discard this draft and reload the latest row? This cannot restore discarded draft values.",
  "note.context": (params, _format) => `${params.column} · Row ${params.rowId}`,
  "headers.label": "Column groups",
  "builder.unavailableOperator": (params, _format) =>
    `${params.operator} is not available for ${params.column}`,
  "remote.liveCount": (params, _format) =>
    `${_format.number(params.count)} live rows`,
  "remote.loadingWindow": " - loading window",
  "remote.readOnly": "Read-only provider",
  "chart.sourceSummary": (params, _format) =>
    `${_format.number(params.count)} source rows. Showing ${_format.number(params.shown)} of ${_format.number(params.total)} ${params.kind}.`,
  "chart.rowPoints": (_params, _format) => `row points`,
  "chart.categories": (_params, _format) => `categories`,
  "chart.sampling":
    "Uniform sampling is active; intermediate extrema may be omitted.",
  "grid.row": "Row",
  "grid.column": "Column",
  "grid.spanHelp": (params, _format) =>
    `${params.kind} spanning is configured. Cell ranges, grid clipboard and fill are unavailable; row selection and cell editing remain available.`,
  "grid.spanConflict":
    "Combined row and column spanning is not supported in one grid",
  "grid.spanBudget":
    "Row spanning supports at most 100000 visible rows and 8 active columns",
  "move.rowSpans": "Turn off row spanning before moving rows",
  "grid.rowUpdated": "Row updated",
  "grid.findFailed": "Find failed",
  "grid.filterPlaceholder": "Filter...",
  "grid.numberFilterPlaceholder": "= value",
  "grid.booleanAll": "All",
  "grid.booleanTrue": "True",
  "grid.booleanFalse": "False",
  "grid.sparkline": "Trend",
  "grid.fillHandle": "Drag to fill cells; Alt-drag extends a numeric series",
  "grid.dragHelp": "Drag to move; Alt+Up or Alt+Down moves one row",
  "grid.rowMoveHelp":
    "Drag a row handle or press Alt+Up or Alt+Down on a cell. Moves stay within this page.",
  "grid.rowSpanHelp":
    "Row spanning is configured. Cell ranges, grid clipboard and fill are unavailable; row selection and cell editing remain available.",
  "chart.xColumnLabel": "X column",
  "chart.aggregateLabel": "Aggregate",
  "chart.caption": "Displayed chart values",
  "chart.captionSampled": "Displayed chart values (uniformly sampled)",
  "chart.noSeries": "no numeric series",
  "chart.category": "Category",
  "chart.blank": "(blank)",
  "chart.typeBar": "bar",
  "chart.typeLine": "line",
  "chart.typeScatter": "scatter",
  "print.noColumns": "No visible columns to print.",
  "print.invalidScope": "Unknown print scope",
  "builder.column": "Column",
  "builder.operator": "Operator",
  "builder.setValues": "Set values",
  "builder.value": "Value",
  "builder.upper": "Upper value",
  "builder.match": "Match",
  "builder.root": "root",
  "builder.allConditions": "All conditions (AND)",
  "builder.anyCondition": "Any condition (OR)",
  "builder.negateLogic": "Negate (NOT)",
  "builder.isoPlaceholder": "YYYY-MM-DD",
  "remote.blankGroup": "(blank)",
  "remote.livePlaceholder": "Loading...",
  "grid.booleanFilterColumn": (params, _format) => `Filter ${params.column}`,
  "chart.ySeries": (params, _format) =>
    `Y series (${_format.number(params.count)}/${_format.number(params.limit)})`,
  "chart.dataTable": (params, _format) =>
    `Chart data table (${_format.number(params.count)} rows)`,
  "chart.description": (params, _format) =>
    `${params.type} chart of ${params.series} by ${params.x}. ${_format.number(params.count)} displayed points. Exact displayed values follow in a data table.`,
  "print.createError": (params, _format) =>
    `Unable to create print snapshot: ${params.error}`,
  "print.invalidLimit": (params, _format) =>
    `${params.name} must be an integer from 1 through ${_format.number(params.limit)}`,
  "builder.sourceDepthLimit": (params, _format) =>
    `This builder supports at most ${_format.number(params.maximumDepth)} levels. Clear the draft or replace the filter to continue.`,
  "builder.addGroup": (params, _format) => `Add ${params.kind} group`,
  "builder.condition": (params, _format) => `Condition ${params.label}`,
  "builder.group": (params, _format) => `Group ${params.label}`,
  "builder.unavailableColumn": (params, _format) =>
    `Unavailable column: ${params.column}`,
  "note.help": (params, _format) =>
    `Notes are plain text. Empty notes are removed. ${_format.number(params.current)} / ${_format.number(params.maximum)} characters.`,
  "remote.pivotCount": (params, _format) =>
    `; ${_format.number(params.count)} server pivot result columns available`,
  "remote.serverPage": (params, _format) =>
    `Server page ${_format.number(params.page)} of ${params.pages}`,
  "setList.values": "Values",
  "setList.title": (params, _format) => "Values for " + params.column,
  "setList.help":
    "Choices come from all resident rows. Search narrows choices only. Changes are staged until Apply. Other column, quick and advanced filters remain combined with this filter.",
  "setList.modelRequired":
    "A resident grid model is required to choose values.",
  "setList.indexFailed":
    "Unable to build the value choices. The applied filter was preserved.",
  "setList.readFailed":
    "This filter could not be inspected within the supported limits. The applied filter was preserved.",
  "setList.applyFailed":
    "Unable to apply these values. Keep editing or cancel.",
  "setList.conflict":
    "The applied filter changed while this draft was being edited. Reload the applied filter to discard the draft, or Cancel. Apply is unavailable until then.",
  "setList.unsupported":
    "The applied filter is not a value list. Clear it here and Apply to replace it, or Cancel to preserve it.",
  "setList.removed": (params, _format) =>
    _format.number(params.count) +
    " selected values disappeared from the source. Review the draft before applying.",
  "setList.search": "Search values",
  "setList.searchLimit": "Search is limited to 256 characters.",
  "setList.choices": "Value choices",
  "setList.selectMatches": "Select all matching values",
  "setList.blank": "(Blank or invalid)",
  "setList.entryCount": (params, _format) =>
    "(" + _format.number(params.count) + " rows)",
  "setList.invalidHint": (params, _format) =>
    "Includes " + _format.number(params.count) + " invalid typed values",
  "setList.empty": "No matching value choices",
  "setList.summary": (params, _format) =>
    _format.number(params.selected) +
    " of " +
    _format.number(params.total) +
    " values selected from " +
    _format.number(params.rows) +
    " resident rows",
  "setList.pages": "Value choice pages",
  "setList.page": (params, _format) =>
    "Page " +
    _format.number(params.page) +
    " of " +
    _format.number(params.pages),
  "setList.reload": "Reload applied filter",
  "setList.apply": "Apply",
  "setList.choiceIdentity": (params, _format) =>
    params.type + ": " + params.value,
  "setList.typeBigInt": "Integer",
  "setList.typeNumber": "Number",
  "setList.typeBoolean": "Boolean",
  "setList.typeText": "Text",
  "setList.typeDate": "Date",
  "conditionFilter.title": (params, _format) =>
    `Conditions for ${params.column}`,
  "conditionFilter.help":
    "Set one or more conditions for this column. Changes apply together when you choose Apply.",
  "conditionFilter.logic": "Match conditions",
  "rangeFilter.compound":
    "This column has grouped conditions. Clear them before entering a range.",
  "conditionFilter.and": "All conditions (AND)",
  "conditionFilter.or": "Any condition (OR)",
  "conditionFilter.condition": (params, format) =>
    `Condition ${format.number(params.index)}`,
  "conditionFilter.operator": (params, format) =>
    `Operator for condition ${format.number(params.index)}`,
  "conditionFilter.value": (params, format) =>
    `Value for condition ${format.number(params.index)}`,
  "conditionFilter.upper": (params, format) =>
    `Upper value for condition ${format.number(params.index)}`,
  "conditionFilter.calendar": (params, format) =>
    `Choose UTC date for condition ${format.number(params.index)}`,
  "conditionFilter.dateHelp":
    "Calendar choices use midnight UTC. ISO timestamps preserve their time and offset. Comparisons use instants.",
  "conditionFilter.membershipHelp":
    "Enter a JSON array of values. Quote large integers for BigInt columns; null selects blank values.",
  "conditionFilter.add": "Add condition",
  "conditionFilter.remove": (params, format) =>
    `Remove condition ${format.number(params.index)}`,
  "conditionFilter.apply": "Apply conditions",
  "conditionFilter.reload": "Reload current filter",
  "conditionFilter.replace": "Replace with new conditions",
  "conditionFilter.conflict":
    "The column filter changed. Reload it or replace it explicitly before applying your draft.",
  "conditionFilter.unsupported":
    "This filter cannot be edited here. Keep it, reload it, or choose Replace or Clear explicitly.",
  "conditionFilter.invalid":
    "Enter a supported operator and valid values for each condition.",
  "conditionFilter.limit":
    "Conditions are limited to 16 rows, 10,000 list values and 256,000 operand characters.",
  "conditionFilter.membership":
    "Enter a JSON array of primitive values. Large BigInt values must be quoted integers.",
  "conditionFilter.required": "Enter a value for this condition.",
  "conditionFilter.failed": "Unable to apply these conditions.",
  "formula.mode": "Cell input mode",
  "formula.literal": "Literal",
  "formula.formula": "Formula",
  "formula.modeHelp":
    "Literal stores a value. Formula evaluates an expression. Alt+M focuses the mode selector; Enter in that selector returns to the input. Tab from the input commits the cell. Changing mode preserves the draft text.",
} satisfies GridMessages);
export const enUS: GridLocale = Object.freeze({
  id: "en-US",
  messages: enMessages,
});
