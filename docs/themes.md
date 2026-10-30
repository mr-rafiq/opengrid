# Themes and responsive UI

OpenGrid uses a neutral light palette and one blue accent. Import the stylesheet once:

```tsx
import "@opengrid/react/styles.css";
import { GridThemeProvider, GridThemeSelect, DataGrid } from "@opengrid/react";

<GridThemeProvider>
  <GridThemeSelect />
  <DataGrid model={model} />
</GridThemeProvider>;
```

The selector offers **System**, **Light** and **Dark**. System follows live operating-system changes. Explicit choices persist in `localStorage` under `opengrid-theme` and synchronize between tabs. If storage is blocked, the current document still changes. The provider is optional when using `GridThemeSelect` or `useGridTheme`, which subscribe directly. Mount one subscriber for live system updates. The hook returns `preference`, `resolved` and `setTheme`. `setGridTheme("dark")` also changes the current document directly.

The CSS defaults to the system preference without JavaScript. For a saved preference before React hydrates, put this guarded bootstrap in the document head before styles:

```html
<script>
  (() => {
    let preference = "system";
    try {
      const saved = localStorage.getItem("opengrid-theme");
      if (["system", "light", "dark"].includes(saved)) preference = saved;
    } catch {}
    const theme =
      preference === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.dataset.ogThemePreference = preference;
    document.documentElement.dataset.ogTheme = theme;
    document.documentElement.style.colorScheme = theme;
  })();
</script>
```

Use `.og-light` or `.og-dark` on a grid or containing element for a local override. These classes override the complete palette, including native controls and charts. `themes.css` is separately exported for app shells that need tokens before mounting a grid. Tokens include `--og-bg`, `--og-surface`, `--og-canvas`, `--og-text`, `--og-muted`, `--og-border`, `--og-control-border`, `--og-accent`, `--og-selected`, `--og-focus` and semantic success, warning and danger colors. Override tokens after the imported CSS and verify contrast for your own content.

The showcase and playground share the same preference on their deployed origin. Desktop playground navigation can collapse; at tablet and phone sizes it becomes a modal drawer. Documentation groups expand independently and keep the current guide visible. Drawers support Escape, focus containment, background scroll locking and focus return. Grid content scrolls horizontally within its viewport; the surrounding page does not need to expand. Compact toolbar icons retain localized accessible names and tooltips. View options and exports remain available through labeled disclosures.

New playground sessions below 600px start with unpinned columns so horizontal scrolling can reach every field. The Columns chooser can pin them explicitly; resizing does not discard a user's pin choices. This is an example-app default, not a library override of configured pins.

Default row heights and the keyboard/editing model are unchanged. Responsive styling does not imply all custom application renderers are automatically responsive: constrain custom editors, full-width content and detail panels. Browser checks cover Chromium; no manual screen-reader certification is claimed.
