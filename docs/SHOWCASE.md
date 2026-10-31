# Participant showcase

[Open the live demo](https://mr-rafiq.github.io/opengrid/showcase/). Created by Mohamed Rafiq.

The participant example uses the actual OpenGrid React component with 22 columns and deterministic fictional records. No participant information is fetched from a server. Choose 1,000, 10,000 or 100,000 rows. Larger sizes use the same client-side model, with virtualized rows and columns; device performance varies. This example is not a server-side scalability benchmark.

Records, Participant, Game of choice, Performance, Statistics and Activity headers organize names, language, country, games, purchase flags, balances, ratings and numeric metrics. Country flags are original decorative SVGs with adjacent country labels. Ratings include an accessible numeric label. Record numbers are stable source identifiers, so they do not change after sorting. Double-click Name to edit it, or use the purchase checkboxes. Changing data size replaces the fictional records and resets edits. Changing style or color mode keeps model state and edits.

## Columns, filters, groups and values

The right sidebar has vertical **Columns** and **Filters** tabs. Arrow Up/Down, Home and End navigate these tabs. Search matches column and grouped-header names. Expand a header category and use its checkboxes to change visibility; its group checkbox changes the matching category atomically and reflects mixed visibility. Hidden columns remain available to filters and aggregations.

The **Row groups** area above the grid and in the sidebar share one model. Drag a header into either area, or use the native column selector and **Add group** button with keyboard or touch. Move, sort and remove group chips with their native controls. Grouping disables manual source-row dragging; remove grouping/sort/filter before reordering rows. The sample deliberately limits grouping to low-cardinality categorical fields. See [grouping](GROUPING.md) for totals and server branch examples.

**Values** selectors change real column aggregate functions: sum, average, minimum, maximum or count. Existing custom functions are preserved until you explicitly choose a replacement. These controls use `model.getColumnDefinitions()` and client-side `model.setColumns`, preserving definition defaults separately from the current layout, so definition-dependent editing/filter drafts are cancelled by the normal definition epoch checks. Aggregate labels currently display raw values; currency and star renderers apply to source rows. Pivot UI is not advertised in this demo.

The Filters tab opens the existing typed condition editor for each filterable column. These conditions are model-owned and remain synchronized with floating filters above the data. **Reset view** clears view, grouping, filter, selection and layout state while retaining edits and configured aggregate functions. This is a read/write client example, not a remote data service.

## Style and appearance

**Grid style** offers Minimal (the neutral default) and a distinct **Material** preset. Material uses flat surfaces, horizontal separators, sentence-case muted headers, underline search/filter fields, square pink checked controls and more spacious source rows. The same preset has light and dark renderings. It is an original OpenGrid interpretation, without a Material or AG Grid runtime dependency.

The separate **Appearance** selector offers System, Light and Dark. Color mode is shared across the website and component playground. Grid style persists separately in `opengrid-showcase-preset`; the neutral preset is the initial server-rendered view. No stored value is required to use the demo. On small screens, **Columns & filters** opens a native modal drawer with Escape, background scroll locking and focus return. The grid scrolls horizontally inside its own viewport.

## Reuse in your application

```tsx
import { DataGrid, GridSidePanel } from "@opengrid/react";
import "@opengrid/react/styles.css";

<div className="og-preset-material">
  <DataGrid model={model} rowHeight={48} rowGroupPanel="always" />
  <GridSidePanel model={model} />
</div>;
```

`GridSidePanel` is a resident client-model component. Its `labels` prop accepts translated sidebar labels; use `GridLocaleProvider` for the embedded group and condition controls. Host it in your own responsive layout/modal. It does not install a global drawer, change row height, connect a remote datasource or provide pivot configuration. The `og-preset-material` class scopes the preset to the grid, sidebar and popup hosts below it. Color mode still comes from the [shared theme tokens](themes.md). `GridThemeSelect` accepts an optional `ariaLabel` when several selectors are present. `ColumnConditionFilter` accepts optional decorative `trigger` content while retaining its required accessible `label`.

Source: [participant data](../examples/site/src/participant-data.ts), [showcase component](../examples/site/src/ParticipantShowcase.tsx), [sidebar](../packages/react/src/side-panel.tsx).
