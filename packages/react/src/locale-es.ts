import type { GridLocale, GridMessages } from "./locale-messages.js";
export const esMessages = Object.freeze({
  "common.cancel": "Cancelar",
  "common.clear": "Limpiar",
  "common.remove": "Quitar",
  "common.close": "Cerrar",
  "common.previous": "Anterior",
  "common.next": "Siguiente",
  "common.true": "Verdadero",
  "common.false": "Falso",
  "common.none": "(ninguna)",
  "common.retry": "Reintentar",
  "grid.ariaLabel": "Cuadrícula de datos",
  "grid.tools": "Herramientas de la cuadrícula",
  "grid.searchLabel": "Buscar en todas las filas",
  "grid.searchPlaceholder": "Buscar en todas las filas...",
  "grid.moveUp": "Subir la fila enfocada",
  "grid.moveDown": "Bajar la fila enfocada",
  "grid.editRow": "Editar fila",
  "grid.editFocusedCell": "Editar celda",
  "grid.extendRange": "Extender rango",
  "grid.extendRangeHelp":
    "Toque una celda para extender el rango actual. Puede desplazarse antes de elegir el extremo.",
  "grid.fillMode": "Modo de relleno",
  "grid.fillCopy": "Copiar valores",
  "grid.fillSeries": "Extender serie numérica",
  "grid.touchHelp":
    "Toque para enfocar una celda. Toque dos veces una celda editable o use Editar celda. Desplácese o use dos dedos para ampliar o reducir la vista de la cuadrícula.",
  "grid.touchMoveHelp":
    "En pantallas táctiles, use Subir la fila enfocada o Bajar la fila enfocada para reorganizar las filas.",
  "grid.find": "Buscar",
  "grid.note": "Nota",
  "grid.advancedFilter": "Filtro avanzado",
  "grid.copy": "Copiar",
  "grid.copyLabel": "Copiar las celdas seleccionadas",
  "grid.paste": "Pegar",
  "grid.pasteLabel": "Pegar celdas",
  "grid.fillDown": "Rellenar hacia abajo",
  "grid.fillDownLabel": "Rellenar hacia abajo las celdas seleccionadas",
  "grid.undo": "Deshacer",
  "grid.redo": "Rehacer",
  "grid.undoRequested": "Se solicitó deshacer",
  "grid.redoRequested": "Se solicitó rehacer",
  "grid.exportCsv": "Exportar CSV",
  "grid.columns": "Columnas",
  "grid.arrangeView": "Organizar la vista",
  "grid.unpinned": "Sin fijar",
  "grid.pinLeft": "Fijar a la izquierda",
  "grid.pinRight": "Fijar a la derecha",
  "grid.rowControls": "Controles de fila",
  "grid.selectPage": "Seleccionar todas las filas de la página",
  "grid.pinnedTop": "Filas fijadas arriba",
  "grid.pinnedBottom": "Filas fijadas abajo",
  "grid.empty": "No hay filas coincidentes",
  "grid.rowsPerPage": "Filas por página",
  "grid.previousPage": "Página anterior",
  "grid.nextPage": "Página siguiente",
  "grid.cellUpdated": "Celda actualizada",
  "grid.changeUndone": "Cambio deshecho",
  "grid.changeRedone": "Cambio rehecho",
  "grid.noHistory": "No hay cambios que restaurar",
  "grid.hiddenEditCancelled":
    "Se canceló la edición porque la celda ya no está visible",
  "grid.columnSpanHelp":
    "Hay celdas que abarcan varias columnas. Los rangos, el portapapeles de la cuadrícula y el relleno no están disponibles; la selección de filas y la edición de celdas siguen disponibles.",
  "find.label": "Buscar en la vista actual",
  "find.placeholder": "Buscar sin filtrar las filas",
  "find.previous": "Coincidencia anterior",
  "find.next": "Coincidencia siguiente",
  "find.close": "Cerrar búsqueda",
  "find.none": "No hay coincidencias",
  "move.unsupported":
    "Este origen de datos no admite mover filas de forma gestionada",
  "move.disabled": "El movimiento de filas no está habilitado",
  "move.noColumns": "Muestre una columna de datos antes de mover filas",
  "move.editing": "Termine o cancele la edición antes de mover filas",
  "move.pins": "Quite las filas fijadas de esta vista antes de mover filas",
  "move.fullWidth":
    "Desactive las filas de ancho completo antes de mover filas",
  "move.details": "Cierre los paneles de detalles antes de mover filas",
  "move.flat": "El movimiento gestionado requiere filas normales sin jerarquía",
  "move.changed": "La vista de filas cambió. Inicie el movimiento de nuevo.",
  "move.cancelled": "Movimiento de fila cancelado",
  "move.pageOnly": "Los movimientos deben mantenerse en la página actual",
  "move.failed": "No se puede mover esta fila",
  "move.first": "La fila ya es la primera de esta página",
  "move.last": "La fila ya es la última de esta página",
  "move.foreign":
    "Aquí solo se puede mover una fila arrastrada desde esta cuadrícula",
  "move.sorting": "Quite la ordenación antes de reorganizar filas",
  "move.filtering": "Quite los filtros antes de reorganizar filas",
  "move.grouping": "Quite la agrupación antes de reorganizar filas",
  "move.tree": "No se pueden reorganizar filas de datos en árbol",
  "move.externalFilter": "Quite el filtro externo antes de reorganizar filas",
  "filter.all": "Todos",
  "filter.contains": "Contiene",
  "filter.equals": "Es igual a",
  "filter.notEqual": "No es igual a",
  "filter.startsWith": "Empieza por",
  "filter.endsWith": "Termina en",
  "filter.gt": "Mayor que",
  "filter.gte": "Mayor o igual que",
  "filter.lt": "Menor que",
  "filter.lte": "Menor o igual que",
  "filter.in": "Es uno de",
  "filter.between": "Entre",
  "filter.blank": "Está vacío",
  "filter.notBlank": "No está vacío",
  "filter.fromDate": "Desde la fecha",
  "filter.toDate": "Hasta la fecha",
  "filter.min": "Mín.",
  "filter.max": "Máx.",
  "filter.chooseBoolean": "Elija un valor booleano",
  "filter.invalidDate": "Fecha no válida",
  "rangeFilter.notRange":
    "El filtro actual no es un intervalo inclusivo. Cambie un límite o límpielo para sustituirlo.",
  "rangeFilter.boundLimit":
    "Cada límite del intervalo admite hasta 256 caracteres",
  "rangeFilter.integer":
    "Introduzca un entero completo para cada límite BigInt",
  "rangeFilter.iso": "Use una fecha o marca de tiempo ISO para cada límite",
  "rangeFilter.date": "Introduzca una fecha válida para cada límite",
  "rangeFilter.number": "Introduzca un número finito completo para cada límite",
  "rangeFilter.type":
    "Este filtro de intervalo admite columnas de números, BigInt y fechas",
  "rangeFilter.order": "El mínimo no debe superar el máximo",
  "rangeFilter.applyFailed": "No se puede aplicar este intervalo",
  "rangeFilter.clearFailed": "No se puede limpiar este intervalo",
  "builder.title": "Filtro avanzado",
  "builder.help":
    "Cree condiciones anidadas con Y, O y NO. Los conjuntos admiten un arreglo JSON o un valor por línea. Escriba los enteros grandes entre comillas en JSON. Los cambios se aplican al pulsar Aplicar.",
  "builder.noColumns": "No hay columnas que se puedan filtrar",
  "builder.empty": "No hay filtro avanzado",
  "builder.clear": "Limpiar borrador",
  "builder.apply": "Aplicar filtro",
  "builder.addCondition": "Añadir condición",
  "builder.and": "Y",
  "builder.or": "O",
  "builder.not": "NO",
  "builder.negate": "Negar condición",
  "builder.removeGroup": "Quitar grupo",
  "builder.unsupported": "Expresión de filtro avanzado no admitida",
  "builder.readFailed": "No se puede leer este filtro",
  "builder.arraySyntax":
    "Los valores deben ser un arreglo JSON válido o un valor por línea",
  "builder.arrayRequired": "Los valores deben formar un arreglo JSON",
  "builder.scalarValues":
    "Los valores solo pueden ser texto, números, booleanos o null",
  "builder.emptySet": "Introduzca al menos un valor",
  "builder.bigIntJson":
    "Use cadenas entre comillas para valores BigInt grandes en arreglos JSON",
  "builder.emptyGroup": "Cada grupo Y u O necesita al menos una condición",
  "builder.applyFailed": "No se puede aplicar este filtro",
  "editor.choose": "Elija un valor",
  "editor.loading": "Cargando opciones...",
  "editor.retry": "Reintentar opciones",
  "editor.invalidChoices":
    "El proveedor de opciones devolvió valores no válidos",
  "editor.loadFailed": "No se pueden cargar las opciones",
  "rowEdit.startFailed": "No se puede iniciar la edición de la fila",
  "rowEdit.noFields": "Esta fila no tiene campos visibles editables",
  "rowEdit.saveFailed": "No se puede guardar esta fila",
  "rowEdit.discardReload": "Descartar borrador y recargar",
  "rowEdit.keepEditing": "Seguir editando",
  "rowEdit.reload": "Recargar fila",
  "rowEdit.save": "Guardar fila",
  "note.title": "Nota de celda",
  "note.text": "Texto de la nota",
  "note.readFailed": "No se puede leer esta nota",
  "note.saveFailed": "No se puede guardar esta nota",
  "note.delete": "Eliminar nota",
  "note.save": "Guardar nota",
  "range.filled": "Rango rellenado. Deshacer restaura los valores anteriores.",
  "range.copied": "Celdas seleccionadas copiadas.",
  "range.copyFailed": "No se pueden copiar las celdas",
  "range.pasted": "Celdas pegadas. Deshacer restaura los valores anteriores.",
  "range.copyUnavailable":
    "El portapapeles no está disponible. Use el atajo de teclado para copiar.",
  "range.pasteUnavailable":
    "El portapapeles no está disponible. Use el atajo de teclado para pegar.",
  "range.writeFailed": "No se pudo escribir en el portapapeles",
  "range.readFailed": "No se pudo leer el portapapeles",
  "remote.serverLabel": "Cuadrícula de datos del servidor",
  "remote.liveLabel": "Cuadrícula de datos en directo",
  "remote.allGroups": "Todos los grupos",
  "remote.columns": "Columnas del servidor",
  "remote.loading": "Cargando filas del servidor... ",
  "remote.routePending": "Cantidad de la ruta pendiente",
  "remote.retryServer": "Reintentar filas del servidor",
  "remote.previousPage": "Página anterior del servidor",
  "remote.nextPage": "Página siguiente del servidor",
  "remote.countPending": "Cantidad de filas remotas pendiente",
  "remote.retryLive": "Reintentar filas en directo",
  "remote.emptyLive": "No hay filas en directo",
  "chart.label": "Gráfico de la cuadrícula",
  "chart.config": "Configuración del gráfico",
  "chart.type": "Tipo de gráfico",
  "chart.bar": "Barras",
  "chart.line": "Líneas",
  "chart.scatter": "Dispersión",
  "chart.xColumn": "Columna X del gráfico",
  "chart.noColumns": "No hay columnas",
  "chart.aggregation": "Agregación del gráfico",
  "chart.sum": "Suma",
  "chart.average": "Promedio",
  "chart.series": "Series numéricas",
  "chart.export": "Exportar gráfico SVG",
  "chart.exported": "Gráfico SVG exportado",
  "chart.unavailable": "Este navegador no permite exportar el gráfico",
  "chart.rangeGone": "El rango seleccionado ya no está visible.",
  "chart.scatterHelp": "La dispersión usa valores X numéricos.",
  "chart.empty": "No hay valores numéricos finitos para representar",
  "chart.legend": "Leyenda del gráfico",
  "print.title": "Vista de impresión de la cuadrícula",
  "print.filtered": "Filas ordenadas y filtradas",
  "print.view": "Vista expandida de grupos/árbol",
  "print.page": "Página actual",
  "print.selected": "Filas seleccionadas en los resultados filtrados actuales",
  "print.all": "Todas las filas de origen (orden de entrada)",
  "print.unknown": "Ámbito desconocido",
  "print.buildFailed": "No se puede crear la captura de impresión",
  "print.requested":
    "Se solicitó el diálogo de impresión. La configuración del navegador controla el resultado final.",
  "print.unavailable": "Este navegador no permite imprimir.",
  "print.refreshed": "Captura actualizada.",
  "print.refresh": "Actualizar captura de impresión",
  "print.print": "Imprimir captura",
  "print.stale":
    "La cuadrícula cambió; actualice la captura antes de imprimir.",
  "print.captured":
    "Captura guardada; los cambios posteriores no modifican sus valores.",
  "print.empty": "No hay filas en este ámbito de impresión.",
  "grid.showColumn": (params, _format) => `Mostrar ${params.column}`,
  "grid.pinColumn": (params, _format) => `Fijar ${params.column}`,
  "grid.moveColumnLeft": (params, _format) =>
    `Mover ${params.column} a la izquierda`,
  "grid.moveColumnRight": (params, _format) =>
    `Mover ${params.column} a la derecha`,
  "grid.sortColumn": (params, _format) => `Ordenar ${params.column}`,
  "grid.resizeColumn": (params, _format) =>
    `Cambiar el ancho de ${params.column}`,
  "grid.filterColumn": (params, _format) => `Filtrar ${params.column}`,
  "grid.editCell": (params, _format) =>
    `Editar ${params.column} de la fila ${params.rowId}`,
  "grid.selectRow": (params, _format) => `Seleccionar la fila ${params.rowId}`,
  "grid.dragRow": (params, _format) => `Arrastrar la fila ${params.rowId}`,
  "grid.expandDetails": (params, _format) =>
    `Expandir los detalles de la fila ${params.rowId}`,
  "grid.collapseDetails": (params, _format) =>
    `Contraer los detalles de la fila ${params.rowId}`,
  "grid.details": (params, _format) => `Detalles de la fila ${params.rowId}`,
  "grid.expandGroup": (params, _format) => `Expandir ${params.group}`,
  "grid.collapseGroup": (params, _format) => `Contraer ${params.group}`,
  "grid.rowCount": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "fila", other: "filas" })}`,
  "grid.selectedCount": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "seleccionada", other: "seleccionadas" })}`,
  "grid.cellCount": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "celda seleccionada", other: "celdas seleccionadas" })}`,
  "grid.pageCount": (params, _format) =>
    `Página ${_format.number(params.page)} de ${_format.number(params.pages)}`,
  "find.position": (params, _format) =>
    `${_format.number(params.position)} de ${_format.number(params.count)}`,
  "move.moved": (params, _format) =>
    `Fila ${params.rowId} movida a la posición ${_format.number(params.position)} de esta página`,
  "move.moving": (params, _format) =>
    `Moviendo la fila ${params.rowId}. Suéltela antes o después de otra fila de esta página.`,
  "headers.expand": (params, _format) =>
    `Expandir el grupo de columnas ${params.path}`,
  "headers.collapse": (params, _format) =>
    `Contraer el grupo de columnas ${params.path}`,
  "rangeFilter.label": (params, _format) => `Intervalo de ${params.column}`,
  "rangeFilter.minimum": (params, _format) => `Mínimo de ${params.column}`,
  "rangeFilter.maximum": (params, _format) => `Máximo de ${params.column}`,
  "rangeFilter.clear": (params, _format) => `Limpiar ${params.column}`,
  "builder.addConditionLabel": (params, _format) =>
    `Añadir condición ${params.label}`,
  "builder.addGroupLabel": (params, _format) =>
    `Añadir grupo ${params.kind} ${params.label}`,
  "builder.columnLabel": (params, _format) => `Columna ${params.label}`,
  "builder.operatorLabel": (params, _format) => `Operador ${params.label}`,
  "builder.valueLabel": (params, _format) => `Valor ${params.label}`,
  "builder.upperLabel": (params, _format) => `Valor superior ${params.label}`,
  "builder.setLabel": (params, _format) =>
    `Valores del conjunto ${params.label}`,
  "builder.removeConditionLabel": (params, _format) =>
    `Quitar condición ${params.label}`,
  "builder.negateLabel": (params, _format) =>
    `Negar la condición ${params.label}`,
  "builder.matchLabel": (params, _format) => `Coincidencia ${params.label}`,
  "builder.removeGroupLabel": (params, _format) =>
    `Quitar grupo ${params.label}`,
  "builder.depthLimit": (params, _format) =>
    `Un filtro puede tener como máximo ${_format.number(params.maximumDepth)} niveles anidados`,
  "builder.notFilterable": (params, _format) =>
    `La columna ${params.column} no se puede filtrar`,
  "builder.valueRequired": (params, _format) =>
    `Introduzca un valor para ${params.column}`,
  "builder.upperRequired": (params, _format) =>
    `Introduzca un valor superior para ${params.column}`,
  "editor.loadError": (params, _format) =>
    `No se pudieron cargar las opciones: ${params.error}`,
  "rowEdit.title": (params, _format) => `Editar la fila ${params.rowId}`,
  "rowEdit.fieldLabel": (params, _format) => `Editar ${params.column}`,
  "note.forCell": (params, _format) => `${params.column}, fila ${params.rowId}`,
  "note.editLabel": (params, _format) =>
    `Editar la nota de ${params.column} en la fila ${params.rowId}`,
  "remote.controls": (params, _format) => `Controles de ${params.label}`,
  "remote.path": (params, _format) => `Ruta de grupos de ${params.label}`,
  "remote.showColumn": (params, _format) =>
    `Mostrar ${params.column} del servidor`,
  "remote.pinColumn": (params, _format) =>
    `Fijar ${params.column} del servidor`,
  "remote.openGroup": (params, _format) => `Abrir el grupo ${params.group}`,
  "remote.routeCount": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "fila", other: "filas" })} en esta ruta`,
  "remote.selected": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "seleccionada", other: "seleccionadas" })} en esta página cargada`,
  "chart.seriesLabel": (params, _format) =>
    `Serie del gráfico ${params.column}`,
  "chart.repeatHelp": (params, _format) =>
    `Los valores X repetidos usan ${params.operation}.`,
  "print.tableArea": (params, _format) =>
    `Área de desplazamiento de la tabla ${params.title}`,
  "print.level": (params, _format) =>
    `Nivel ${_format.number(params.level)}: ${params.value}`,
  "print.summary": (params, _format) =>
    `${params.scope}. ${_format.number(params.rows)} ${_format.plural(params.rows, { one: "fila", other: "filas" })}, ${_format.number(params.columns)} ${_format.plural(params.columns, { one: "columna", other: "columnas" })}.`,
  "print.rowLimit": (params, _format) =>
    `El ámbito de impresión tiene ${_format.number(params.count)} filas y supera maxRows ${_format.number(params.limit)}. Elija un ámbito menor o aumente el límite explícito.`,
  "print.cellLimit": (params, _format) =>
    `El ámbito de impresión necesita ${_format.number(params.count)} celdas, incluidos los encabezados, y supera maxCells ${_format.number(params.limit)}.`,
  "grid.help": (params, _format) =>
    `Use las flechas para navegar por las celdas, Inicio y Fin para recorrer una fila, y Control Inicio y Fin para llegar a la primera o última celda. Pulse Intro o F2 para editar ${params.target}, Escape para cancelar y Espacio para seleccionar una fila. Use Mayús al pulsar los encabezados para ordenar por varias columnas.`,
  "grid.helpEditRow": "la fila actual en un diálogo",
  "grid.helpEditCells": "las celdas editables",
  "grid.rangeHelp":
    "Mayús y las flechas amplían un rango. Control o Comando A selecciona las celdas visibles; C copia y V pega. Control o Comando D rellena hacia abajo y R hacia la derecha. Arrastre la esquina del rango para rellenar, o use Alt al arrastrar para extender una serie numérica.",
  "grid.findHelp": "Control o Comando F abre la búsqueda en la vista actual.",
  "grid.noteHelp": "Alt N abre la nota de la celda actual.",
  "grid.detailHelp":
    "Alt Intro expande o contrae los detalles de la fila actual.",
  "grid.moveHelp":
    "Alt+Arriba y Alt+Abajo mueven una fila permitida dentro de la página actual.",
  "rowEdit.help":
    "Los cambios permanecen en este formulario hasta pulsar Guardar fila. Intro guarda la fila; en campos de varias líneas use Control o Comando Intro. Cancelar descarta el borrador.",
  "rowEdit.confirmReload":
    "¿Descartar este borrador y recargar la fila más reciente? Los valores descartados no se pueden recuperar.",
  "note.context": (params, _format) =>
    `${params.column} · Fila ${params.rowId}`,
  "headers.label": "Grupos de columnas",
  "builder.unavailableOperator": (params, _format) =>
    `${params.operator} no está disponible para ${params.column}`,
  "remote.liveCount": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "fila en directo", other: "filas en directo" })}`,
  "remote.loadingWindow": " - cargando ventana",
  "remote.readOnly": "Proveedor en directo de solo lectura",
  "chart.sourceSummary": (params, _format) =>
    `${_format.number(params.count)} ${_format.plural(params.count, { one: "fila de origen", other: "filas de origen" })}. Se muestran ${_format.number(params.shown)} de ${_format.number(params.total)} ${params.kind}.`,
  "chart.rowPoints": (params, _format) =>
    `${_format.plural(params.count, { one: "punto de fila", other: "puntos de fila" })}`,
  "chart.categories": (params, _format) =>
    `${_format.plural(params.count, { one: "categoría", other: "categorías" })}`,
  "chart.sampling":
    "El muestreo uniforme está activo; se pueden omitir extremos intermedios.",
  "grid.row": "Fila",
  "grid.column": "Columna",
  "grid.spanHelp": (params, _format) =>
    `Se ha configurado una combinación de celdas de tipo ${params.kind}. Los rangos, el portapapeles de la cuadrícula y el relleno no están disponibles; la selección de filas y la edición de celdas siguen disponibles.`,
  "grid.spanConflict":
    "No se pueden combinar celdas que abarquen filas y columnas en una misma cuadrícula",
  "grid.spanBudget":
    "Las celdas que abarcan filas admiten hasta 100000 filas visibles y 8 columnas activas",
  "move.rowSpans":
    "Desactive las celdas que abarcan filas antes de mover filas",
  "grid.rowUpdated": "Fila actualizada",
  "grid.findFailed": "La búsqueda falló",
  "grid.filterPlaceholder": "Filtrar...",
  "grid.numberFilterPlaceholder": "= valor",
  "grid.booleanAll": "Todos",
  "grid.booleanTrue": "Verdadero",
  "grid.booleanFalse": "Falso",
  "grid.sparkline": "Tendencia",
  "grid.fillHandle":
    "Arrastre para rellenar celdas; Alt al arrastrar extiende una serie numérica",
  "grid.dragHelp": "Arrastre para mover; Alt+Arriba o Alt+Abajo mueve una fila",
  "grid.rowMoveHelp":
    "Arrastre el control de una fila o pulse Alt+Arriba o Alt+Abajo en una celda. Los movimientos se mantienen en esta página.",
  "grid.rowSpanHelp":
    "Hay celdas que abarcan varias filas. Los rangos, el portapapeles de la cuadrícula y el relleno no están disponibles; la selección de filas y la edición de celdas siguen disponibles.",
  "chart.xColumnLabel": "Columna X",
  "chart.aggregateLabel": "Agregación",
  "chart.caption": "Valores mostrados en el gráfico",
  "chart.captionSampled": "Valores mostrados en el gráfico (muestreo uniforme)",
  "chart.noSeries": "ninguna serie numérica",
  "chart.category": "Categoría",
  "chart.blank": "(vacío)",
  "chart.typeBar": "barras",
  "chart.typeLine": "líneas",
  "chart.typeScatter": "dispersión",
  "print.noColumns": "No hay columnas visibles para imprimir.",
  "print.invalidScope": "Ámbito de impresión desconocido",
  "builder.column": "Columna",
  "builder.operator": "Operador",
  "builder.setValues": "Valores del conjunto",
  "builder.value": "Valor",
  "builder.upper": "Valor superior",
  "builder.match": "Coincidencia",
  "builder.root": "raíz",
  "builder.allConditions": "Todas las condiciones (Y)",
  "builder.anyCondition": "Cualquier condición (O)",
  "builder.negateLogic": "Negar (NO)",
  "builder.isoPlaceholder": "AAAA-MM-DD",
  "remote.blankGroup": "(vacío)",
  "remote.livePlaceholder": "Cargando...",
  "grid.booleanFilterColumn": (params, _format) => `Filtrar ${params.column}`,
  "chart.ySeries": (params, _format) =>
    `Series Y (${_format.number(params.count)}/${_format.number(params.limit)})`,
  "chart.dataTable": (params, _format) =>
    `Tabla de datos del gráfico (${_format.number(params.count)} ${_format.plural(params.count, { one: "fila", other: "filas" })})`,
  "chart.description": (params, _format) =>
    `Gráfico de ${params.type} de ${params.series} por ${params.x}. ${_format.number(params.count)} ${_format.plural(params.count, { one: "punto mostrado", other: "puntos mostrados" })}. Los valores exactos se incluyen en la tabla de datos.`,
  "print.createError": (params, _format) =>
    `No se puede crear la captura de impresión: ${params.error}`,
  "print.invalidLimit": (params, _format) =>
    `${params.name} debe ser un entero entre 1 y ${_format.number(params.limit)}`,
  "builder.sourceDepthLimit": (params, _format) =>
    `Este editor admite hasta ${_format.number(params.maximumDepth)} niveles. Limpie el borrador o sustituya el filtro para continuar.`,
  "builder.addGroup": (params, _format) => `Añadir grupo ${params.kind}`,
  "builder.condition": (params, _format) => `Condición ${params.label}`,
  "builder.group": (params, _format) => `Grupo ${params.label}`,
  "builder.unavailableColumn": (params, _format) =>
    `Columna no disponible: ${params.column}`,
  "note.help": (params, _format) =>
    `Las notas son texto sin formato. Las notas vacías se eliminan. ${_format.number(params.current)} / ${_format.number(params.maximum)} caracteres.`,
  "remote.pivotCount": (params, _format) =>
    `; hay ${_format.number(params.count)} ${_format.plural(params.count, { one: "columna de resultados dinámicos disponible", other: "columnas de resultados dinámicos disponibles" })} del servidor`,
  "remote.serverPage": (params, _format) =>
    `Página del servidor ${_format.number(params.page)} de ${params.pages}`,
  "setList.values": "Valores",
  "setList.title": (params, _format) => "Valores de " + params.column,
  "setList.help":
    "Las opciones proceden de todas las filas residentes. La búsqueda solo limita las opciones. Los cambios quedan pendientes hasta Aplicar. Los demás filtros de columna, búsqueda y filtros avanzados siguen combinados con este filtro.",
  "setList.modelRequired":
    "Se necesita un modelo de cuadrícula residente para elegir valores.",
  "setList.indexFailed":
    "No se pudieron generar las opciones. Se conservó el filtro aplicado.",
  "setList.readFailed":
    "No se pudo inspeccionar este filtro dentro de los límites admitidos. Se conservó el filtro aplicado.",
  "setList.applyFailed":
    "No se pudieron aplicar estos valores. Siga editando o cancele.",
  "setList.conflict":
    "El filtro aplicado cambió mientras se editaba este borrador. Recargue el filtro aplicado para descartar el borrador o cancele. Aplicar no está disponible hasta entonces.",
  "setList.unsupported":
    "El filtro aplicado no es una lista de valores. Límpielo aquí y pulse Aplicar para reemplazarlo, o cancele para conservarlo.",
  "setList.removed": (params, _format) =>
    _format.number(params.count) +
    " valores seleccionados desaparecieron del origen. Revise el borrador antes de aplicarlo.",
  "setList.search": "Buscar valores",
  "setList.searchLimit": "La búsqueda se limita a 256 caracteres.",
  "setList.choices": "Opciones de valores",
  "setList.selectMatches": "Seleccionar todos los valores coincidentes",
  "setList.blank": "(Vacío o no válido)",
  "setList.entryCount": (params, _format) =>
    "(" + _format.number(params.count) + " filas)",
  "setList.invalidHint": (params, _format) =>
    "Incluye " +
    _format.number(params.count) +
    " valores no válidos para el tipo",
  "setList.empty": "No hay valores coincidentes",
  "setList.summary": (params, _format) =>
    _format.number(params.selected) +
    " de " +
    _format.number(params.total) +
    " valores seleccionados de " +
    _format.number(params.rows) +
    " filas residentes",
  "setList.pages": "Páginas de opciones de valores",
  "setList.page": (params, _format) =>
    "Página " +
    _format.number(params.page) +
    " de " +
    _format.number(params.pages),
  "setList.reload": "Recargar el filtro aplicado",
  "setList.apply": "Aplicar",
  "setList.choiceIdentity": (params, _format) =>
    params.type + ": " + params.value,
  "setList.typeBigInt": "Entero",
  "setList.typeNumber": "Número",
  "setList.typeBoolean": "Booleano",
  "setList.typeText": "Texto",
  "setList.typeDate": "Fecha",
} satisfies GridMessages);
export const esES: GridLocale = Object.freeze({
  id: "es-ES",
  messages: esMessages,
});
