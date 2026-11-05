# Resident host layout and theme

The experimental `Ag31ClientGrid` can fill a flex workspace without a fixed viewport height. Its `className` belongs to the outer source component, so the application's flex rules apply to the actual workspace child. Original records, ref ownership and row queries survive layout and theme changes.

```tsx
import { Ag31ClientGrid } from "@opengrid/react";
import "@opengrid/react/styles.css";

<div className="workspace">
  <header>Project estimate</header>
  <Ag31ClientGrid
    className="workspace-grid"
    rowData={rows}
    columnDefs={columnDefs}
    getRowId={({ data }) => data.id}
  />
</div>;
```

```css
.workspace {
  display: flex;
  flex-direction: column;
  height: 600px;
  min-width: 0;
}
.workspace > header {
  flex-shrink: 0;
}
.workspace-grid {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
}
```

Without `height`, the source component measures the remaining host space and actual grid chrome. Resizing the parent or changing header density updates the viewport. Intrinsic hosts retain a stable size; very short containers can scroll locally when the headers themselves exceed the available space. Explicit `height` retains the existing viewport-height behavior.

## Existing host tokens

When inherited `--ag-background-color` and `--ag-foreground-color` are present, a scoped adapter adopts host surfaces, text, borders, controls, focus, selection, font and wrapper-radius tokens. Ancestor theme/style changes and stylesheet loads are observed; removing the host values restores the OpenGrid palette. This adapter has no AG Grid runtime or stylesheet dependency.

```css
.estimate-host {
  --ag-background-color: #fcfcfd;
  --ag-foreground-color: #263342;
  --ag-header-background-color: #edf2f7;
  --ag-border-color: #c7d2df;
  --ag-font-size: 12px;
  --ag-font-family: system-ui, sans-serif;
  --ag-browser-color-scheme: light;
  --ag-header-height: 48px;
}
```

Header height follows the resolved host header token, including CSS calculations. Source `headerHeight`, `groupHeaderHeight` and `floatingFiltersHeight` can override it through defined React props/options or `api.setGridOption`; `api.getGridOption` reads the current explicit value. Nullish clearing restores the host/default height. Values must be finite, positive and no larger than one million pixels. An imperative value survives unrelated prop updates; a changed prop replaces it.

Balanced padding groups produce accessible spanning leaf headers. Pin pressure reserves a 50px center and alternates right/left candidates in current order, matching the measured mixed-pin policy. Released columns do not automatically repin when space returns.

## Native controls and scope

Native `DataGrid` retains its 38px header rows, 140px minimum viewport, 64px minimum body and visible status bar by default. `headerRowHeight`, `groupHeaderRowHeight`, `floatingFilterRowHeight`, `minimumViewportHeight` and `minimumBodyHeight` allow constrained host layouts. `statusBar={false}` hides native counts, custom status content and pager controls; provide application paging when disabling that bar. The source bridge omits the unrelated native count bar. Complete source status-panel and tool-panel registries remain unfinished.

The playground's collapsed **Source host layout example** uses original synthetic records and demonstrates parent resizing and independent host palettes. Remaining replacement gaps include full saved state, custom filter hooks and editors, source menu/status/tool panels, complete DOM/CSS selector compatibility, partial processing stages and authenticated application acceptance. Installation remains source-based; no npm publication is advertised.
