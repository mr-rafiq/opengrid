import { useEffect, useMemo, useRef, useState } from "react";
import { createGrid, type Column } from "@opengrid/core";
import {
  DataGrid,
  GridIcon,
  GridThemeSelect,
  GridThemeProvider,
} from "@opengrid/react";
import { NavigationDrawer } from "../../shared/navigation-drawer";
import "../../shared/navigation.css";
import content from "virtual:site-content";

const { base, repository, pages } = content;
const docsUrl = (slug: string) => `${base}docs/${slug}/`;
const quickCode = `const model = createGrid({
  rows: projects,
  columns: [
    { id: "name", field: "name", editable: true },
    { id: "team", field: "team" },
    { id: "cost", field: "cost", type: "number" },
  ],
  getRowId: row => row.id,
});

<DataGrid model={model} height={420} />`;

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <GridIcon name={diagonal ? "external" : "arrowRight"} />;
}
function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function SearchIcon() {
  return <GridIcon name="search" />;
}

interface Project {
  id: string;
  name: string;
  team: string;
  status: string;
  health: number;
  cost: number;
}
const names = [
  "Orbit database",
  "Harbor API",
  "Atlas console",
  "Beacon insights",
  "Canvas studio",
  "Relay workers",
  "Prism design",
  "Field notes",
];
function LiveExample() {
  const [tab, setTab] = useState("grid");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const model = useMemo(() => {
    const columns: Column<Project>[] = [
      {
        id: "name",
        field: "name",
        header: "Project",
        width: 230,
        minWidth: 170,
        editable: true,
        pinned: "left",
      },
      { id: "team", field: "team", header: "Team", width: 160 },
      { id: "status", field: "status", header: "Status", width: 140 },
      {
        id: "health",
        field: "health",
        header: "Progress",
        type: "number",
        width: 180,
      },
      {
        id: "cost",
        field: "cost",
        header: "Monthly budget",
        type: "number",
        width: 175,
        editable: true,
        valueFormatter: (value) => `$${Number(value).toLocaleString("en-US")}`,
        validate: (value) =>
          Number(value) < 0 ? "Use a nonnegative budget" : undefined,
      },
    ];
    return createGrid({
      columns,
      getRowId: (row) => row.id,
      rows: Array.from({ length: 48 }, (_, i) => ({
        id: `project-${i + 1}`,
        name:
          names[i % names.length] + (i > 7 ? ` ${Math.floor(i / 8) + 1}` : ""),
        team: ["Platform", "Product", "Design"][i % 3],
        status: ["Live", "In review", "Building"][i % 3],
        health: [82, 64, 95, 48, 76, 35, 91, 59][i % 8],
        cost: 1200 + i * 375,
      })),
    });
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(quickCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="example-window" id="live-example">
      <div className="example-topline">
        <div className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>workspace / projects</span>
        <span className="example-live">
          <i /> Interactive example
        </span>
      </div>
      <div className="example-controls">
        <div
          className="example-tabs"
          role="tablist"
          aria-label="Example view"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 1
                  : tab === "grid"
                    ? 1
                    : 0;
            setTab(next === 0 ? "grid" : "code");
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>("[role=tab]")
              [next]?.focus();
          }}
        >
          <button
            id="grid-tab"
            role="tab"
            tabIndex={tab === "grid" ? 0 : -1}
            aria-selected={tab === "grid"}
            aria-controls="grid-panel"
            onClick={() => setTab("grid")}
          >
            Live grid
          </button>
          <button
            id="code-tab"
            role="tab"
            tabIndex={tab === "code" ? 0 : -1}
            aria-selected={tab === "code"}
            aria-controls="code-panel"
            onClick={() => setTab("code")}
          >
            React code
          </button>
        </div>
        <span className="example-hint">
          Click a header to sort. Double-click to edit.
        </span>
      </div>
      <div
        id="grid-panel"
        role="tabpanel"
        hidden={tab !== "grid"}
        aria-label="Live project grid"
      >
        <div className="example-filter">
          <label>
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                model.setQuickFilter(event.target.value);
              }}
              placeholder="Find a project, team, or status…"
              aria-label="Filter example projects"
            />
          </label>
          <span>48 illustrative projects</span>
        </div>
        <DataGrid
          model={model}
          height={330}
          ariaLabel="Interactive project showcase"
          toolbar={false}
          pagination={false}
          notes={false}
          advancedFiltering={false}
          columnGroups={false}
          renderCell={({ value, column, row }) =>
            column.id === "status" ? (
              <span
                className={`status-pill status-${String(value).toLowerCase().replace(" ", "-")}`}
              >
                {String(value)}
              </span>
            ) : column.id === "health" ? (
              <span className="progress-cell">
                <span className="progress-track">
                  <i style={{ width: `${Number(value)}%` }} />
                </span>
                <span>{String(value)}%</span>
              </span>
            ) : column.id === "name" ? (
              <span className="project-name">
                <span className="project-glyph" aria-hidden="true">
                  ◈
                </span>
                {String(value)}
              </span>
            ) : column.valueFormatter ? (
              column.valueFormatter(value, row)
            ) : (
              String(value ?? "")
            )
          }
        />
        <div className="example-bottom">
          <span>
            <i aria-hidden="true" /> Powered by the actual OpenGrid React
            component
          </span>
          <a href={`${base}demo/`}>
            Open full playground <Arrow />
          </a>
        </div>
      </div>
      <div
        id="code-panel"
        role="tabpanel"
        hidden={tab !== "code"}
        aria-label="React example source"
        className="example-code"
      >
        <button onClick={copy}>{copied ? "Copied" : "Copy code"}</button>
        <pre tabIndex={0} aria-label="React quick-start code">
          <code>{quickCode}</code>
        </pre>
      </div>
    </div>
  );
}

function Home() {
  return (
    <main id="main-content" className="home">
      <section className="hero page-width">
        <div className="hero-eyebrow">
          <span className="preview-dot" /> Developer preview{" "}
          <span className="eyebrow-line" /> Open source. MIT licensed.
        </div>
        <div className="hero-body">
          <h1>
            Make room
            <br />
            for <em>your data.</em>
          </h1>
          <div className="hero-aside">
            <p>
              A capable React data grid.
              <br />
              An open foundation.
              <br />
              Every possibility is yours.
            </p>
            <p className="hero-detail">
              Sort, edit, group, explore. Build with a typed core and a React
              adapter you can make your own.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={docsUrl("getting-started")}>
                Start building <Arrow />
              </a>
              <a className="text-link" href={`${base}demo/`}>
                Explore the playground <Arrow diagonal />
              </a>
            </div>
          </div>
        </div>
        <div className="hero-proof">
          <span>TypeScript, from the core up</span>
          <span>React rendering</span>
          <span>No license keys</span>
          <span>Source available today</span>
        </div>
      </section>
      <section className="showcase page-width" aria-label="Try OpenGrid">
        <div className="showcase-caption">
          <span>01 / TAKE IT FOR A SPIN</span>
          <span>Real component. Sample data. Your next idea.</span>
        </div>
        <LiveExample />
      </section>
      <section className="capabilities page-width">
        <div className="section-heading">
          <span className="section-kicker">BUILT FOR THE WORK</span>
          <h2>
            Small details.
            <br />A bigger working surface.
          </h2>
          <p>
            Useful interactions belong together. OpenGrid keeps data, state, and
            rendering connected while leaving room for your application.
          </p>
        </div>
        <div className="capability-list">
          <a href={docsUrl("api")}>
            <span className="capability-number">01</span>
            <div>
              <h3>From rows to answers</h3>
              <p>
                Typed filtering, stable multi-sort, groups, tree data, and
                analytical transforms.
              </p>
            </div>
            <Arrow diagonal />
          </a>
          <a href={docsUrl("editors")}>
            <span className="capability-number">02</span>
            <div>
              <h3>Work directly in the grid</h3>
              <p>
                Validated edits, range selection, clipboard, fill, notes, and
                undo that stay in step.
              </p>
            </div>
            <Arrow diagonal />
          </a>
          <a href={docsUrl("remote-grids")}>
            <span className="capability-number">03</span>
            <div>
              <h3>Keep the right data in view</h3>
              <p>
                Virtual rendering plus separate server-block and live-viewport
                strategies.
              </p>
            </div>
            <Arrow diagonal />
          </a>
        </div>
      </section>
      <section className="architecture-section">
        <div className="page-width">
          <div className="architecture-intro">
            <div>
              <span className="section-kicker">OPEN BY DESIGN</span>
              <h2>
                One model.
                <br />
                Your way to build.
              </h2>
            </div>
            <p>
              Use the pieces your project needs. Data logic stays independent of
              React; file generation stays optional.
            </p>
          </div>
          <div className="package-flow">
            <div>
              <span>01 / ENGINE</span>
              <h3>@opengrid/core</h3>
              <p>
                Rows, columns, state, transactions, formulas, and data
                providers.
              </p>
              <span className="package-note">Framework neutral</span>
            </div>
            <span className="flow-plus" aria-hidden="true">
              +
            </span>
            <div>
              <span>02 / INTERFACE</span>
              <h3>@opengrid/react</h3>
              <p>
                Interactive rendering, editors, charts, and keyboard controls.
              </p>
              <span className="package-note">React adapter</span>
            </div>
            <span className="flow-plus" aria-hidden="true">
              +
            </span>
            <div>
              <span>03 / OPTIONAL</span>
              <h3>@opengrid/export</h3>
              <p>
                Real XLSX and PDF output, with a bounded workbook import
                preview.
              </p>
              <span className="package-note">Loaded when needed</span>
            </div>
          </div>
          <p className="package-disclaimer">
            Workspace packages, available from source or local tarballs. Not
            published to npm.
          </p>
          <a className="text-link" href={docsUrl("architecture")}>
            See how it fits together <Arrow />
          </a>
        </div>
      </section>
      <section className="honest-section page-width">
        <span className="section-kicker">A PROJECT IN THE OPEN</span>
        <h2>
          The ambition is broad.
          <br />
          The scope is explicit.
        </h2>
        <div>
          <p>
            OpenGrid is an early preview, with working capabilities and a
            roadmap still ahead. It has its own API and is independent of AG
            Grid.
          </p>
          <p>
            Our feature ledger calls out complete slices, partial
            implementations, and missing areas. Read the boundaries before
            choosing a feature.
          </p>
          <a className="text-link" href={docsUrl("feature-parity")}>
            Explore the feature roadmap <Arrow />
          </a>
        </div>
      </section>
      <section className="start-banner page-width">
        <div>
          <span className="section-kicker">YOUR NEXT BUILD STARTS HERE</span>
          <h2>
            Bring your rows.
            <br />
            Make something useful.
          </h2>
        </div>
        <div>
          <a className="button primary" href={docsUrl("getting-started")}>
            Read the getting started guide <Arrow />
          </a>
          <a className="text-link" href={repository}>
            Browse the source <Arrow diagonal />
          </a>
        </div>
      </section>
    </main>
  );
}

type Page = (typeof pages)[number];
function DocLinks({ page }: { page: Page }) {
  return (
    <nav aria-label="Documentation">
      {content.groups.map((group, index) => (
        <details
          className="nav-group"
          key={group}
          open={page.section === group || index === 0}
        >
          <summary>
            {group}
            <GridIcon name="chevronDown" size={16} />
          </summary>
          {pages
            .filter((item) => item.section === group)
            .map((item) => (
              <a
                key={item.slug}
                href={docsUrl(item.slug)}
                aria-current={item.slug === page.slug ? "page" : undefined}
              >
                {item.title}
              </a>
            ))}
        </details>
      ))}
      <a className="sidebar-repo" href={repository}>
        Improve it on GitHub <GridIcon name="external" size={16} />
      </a>
    </nav>
  );
}
function DocNavigation({
  page,
  open,
  onClose,
}: {
  page: Page;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <aside id="docs-sidebar" className="docs-sidebar">
        <DocLinks page={page} />
      </aside>
      <NavigationDrawer
        id="docs-drawer"
        open={open}
        onClose={onClose}
        label="Documentation menu"
      >
        <DocLinks page={page} />
      </NavigationDrawer>
    </>
  );
}
function Documentation({ page }: { page: Page }) {
  const [navOpen, setNavOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const article = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  function closeNavigation() {
    setNavOpen(false);
    menuButton.current?.focus();
  }
  useEffect(() => {
    function copy(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        ".copy-code",
      );
      if (!button) return;
      const code =
        button.closest(".code-block")?.querySelector("code")?.textContent ?? "";
      navigator.clipboard
        ?.writeText(code)
        .then(() => {
          button.textContent = "Copied";
          button.setAttribute("aria-label", "Copied code");
          setAnnouncement("Code copied to clipboard");
        })
        .catch(() => {
          button.textContent = "Copy unavailable";
          button.setAttribute("aria-label", "Copy unavailable");
          setAnnouncement("Clipboard unavailable. Select the code to copy it.");
        });
      if (!navigator.clipboard)
        setAnnouncement("Clipboard unavailable. Select the code to copy it.");
    }
    const node = article.current;
    node?.addEventListener("click", copy);
    return () => node?.removeEventListener("click", copy);
  }, [page.slug]);
  const index = pages.findIndex((item) => item.slug === page.slug);
  return (
    <main id="main-content" className="docs-layout">
      <DocNavigation page={page} open={navOpen} onClose={closeNavigation} />
      <div className="doc-main">
        <div className="doc-meta">
          <span>
            Documentation <span aria-hidden="true">/</span> {page.section}
          </span>
          <button
            ref={menuButton}
            className="doc-menu"
            aria-expanded={navOpen}
            aria-controls="docs-drawer"
            onClick={() => setNavOpen(!navOpen)}
          >
            <GridIcon name="book" size={16} /> Browse docs
          </button>
        </div>
        <article
          ref={article}
          className="prose"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
        <div className="doc-source">
          <span>Built from the repository Markdown.</span>
          <a href={`${repository}/blob/main/${page.source}`}>
            View source <Arrow diagonal />
          </a>
        </div>
        <nav aria-label="Adjacent documentation" className="doc-pagination">
          {pages[index - 1] ? (
            <a href={docsUrl(pages[index - 1].slug)}>
              <span>Previous</span>
              {pages[index - 1].title}
            </a>
          ) : (
            <span />
          )}
          {pages[index + 1] && (
            <a href={docsUrl(pages[index + 1].slug)}>
              <span>Next</span>
              {pages[index + 1].title} <Arrow />
            </a>
          )}
        </nav>
      </div>
      <aside className="doc-toc">
        <nav aria-label="On this page">
          <h2>On this page</h2>
          {page.headings
            .filter((item) => item.level === 2)
            .map((item) => (
              <a key={item.id} href={`#${item.id}`}>
                {item.label}
              </a>
            ))}
        </nav>
        <div className="doc-help">
          <Mark />
          <strong>Build something open.</strong>
          <a href={`${base}demo/`}>
            Try the playground <Arrow />
          </a>
        </div>
      </aside>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </main>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      if (node?.open) node.close();
    };
  }, []);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = (
    terms.length
      ? pages
          .filter((page) =>
            terms.every((term) =>
              `${page.title} ${page.searchText}`.toLowerCase().includes(term),
            ),
          )
          .sort(
            (a, b) =>
              Number(b.title.toLowerCase().includes(query.toLowerCase())) -
              Number(a.title.toLowerCase().includes(query.toLowerCase())),
          )
      : pages.slice(0, 6)
  ).slice(0, 9);
  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-labelledby="search-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="search-dialog-top">
        <SearchIcon />
        <label className="sr-only" id="search-title" htmlFor="docs-search">
          Search documentation
        </label>
        <input
          id="docs-search"
          autoFocus
          placeholder="Search guides, APIs, and examples…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button onClick={onClose} aria-label="Close search">
          Esc
        </button>
      </div>
      <p className="search-summary" role="status">
        {query ? `${results.length} matching guides` : "Start exploring"}
      </p>
      <div className="search-results">
        {results.map((page) => (
          <a key={page.slug} href={docsUrl(page.slug)}>
            <span>{page.section}</span>
            <strong>{page.title}</strong>
            <p>
              {page.searchText.slice(
                Math.max(
                  0,
                  page.searchText.toLowerCase().indexOf(terms[0] ?? "") - 30,
                ),
                Math.max(
                  0,
                  page.searchText.toLowerCase().indexOf(terms[0] ?? "") - 30,
                ) + 120,
              )}
              …
            </p>
            <Arrow />
          </a>
        ))}
        {results.length === 0 && (
          <div className="search-empty">
            No guides found. Try “editing”, “remote”, or “formulas”.
          </div>
        )}
      </div>
      <div className="search-bottom">
        Searches the complete repository documentation.{" "}
        <span>Tab to navigate · Enter to open</span>
      </div>
    </dialog>
  );
}

export function App({ initialPath }: { initialPath?: string }) {
  const pathname =
    initialPath ??
    (typeof window === "undefined" ? base : window.location.pathname);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    decodedPath = "missing";
  }
  const relative = decodedPath.startsWith(base)
    ? decodedPath
        .slice(base.length)
        .replace(/(^|\/)index\.html$/, "$1")
        .replace(/\/+$/, "")
    : "missing";
  const page = relative.startsWith("docs/")
    ? pages.find((item) => item.slug === relative.slice(5))
    : undefined;
  const home = relative === "" || relative === "index.html";
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <GridThemeProvider>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={base} aria-label="OpenGrid home">
            <Mark />
            <span>
              OpenGrid<span className="brand-period">.</span>
            </span>
          </a>
          <span className="version-pill">v0.1 · preview</span>
          <button
            className="mobile-menu-toggle"
            aria-controls="main-navigation-drawer"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <GridIcon name="menu" /> Menu
          </button>
          <nav
            id="main-navigation"
            aria-label="Main navigation"
            className="desktop-navigation"
          >
            <a
              href={docsUrl("getting-started")}
              aria-current={page ? "page" : undefined}
            >
              Documentation
            </a>
            <a href={`${base}demo/`}>Playground</a>
            <a href={repository}>
              GitHub <Arrow diagonal />
            </a>
          </nav>
          <GridThemeSelect className="desktop-theme" />
          <button
            className="header-search"
            onClick={() => setSearchOpen(true)}
            aria-label="Search docs"
            title="Search docs (Ctrl or Command K)"
          >
            <SearchIcon />
            <span>Search docs</span>
          </button>
        </div>
      </header>
      <NavigationDrawer
        id="main-navigation-drawer"
        desktopWidth={700}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        label="Main navigation"
      >
        <nav aria-label="Main navigation">
          <a href={docsUrl("getting-started")}>Documentation</a>
          <a href={`${base}demo/`}>Playground</a>
          <a href={repository}>
            GitHub <GridIcon name="external" size={16} />
          </a>
        </nav>
        <GridThemeSelect />
      </NavigationDrawer>
      {home ? (
        <Home />
      ) : page ? (
        <Documentation page={page} />
      ) : (
        <main id="main-content" className="not-found page-width">
          <span className="section-kicker">404 / UNCHARTED TERRITORY</span>
          <h1>This cell is empty.</h1>
          <p>
            The page may have moved. There’s plenty to explore back in the docs.
          </p>
          <a className="button primary" href={docsUrl("getting-started")}>
            Find your starting point <Arrow />
          </a>
          <a href={base}>Back to OpenGrid</a>
        </main>
      )}
      <footer className="site-footer page-width">
        <div>
          <a className="brand" href={base}>
            <Mark />
            <span>OpenGrid.</span>
          </a>
          <p>
            Built in the open.
            <br />
            Made for your next idea.
          </p>
        </div>
        <div>
          <a href={docsUrl("getting-started")}>Documentation</a>
          <a href={docsUrl("feature-parity")}>Roadmap & scope</a>
          <a href={docsUrl("contributing")}>Contribute</a>
          <a href={repository}>
            Source on GitHub <Arrow diagonal />
          </a>
        </div>
        <div className="footer-note">
          <span>Original code. MIT licensed.</span>
          <a href={docsUrl("third-party-notices")}>Dependency notices</a>
          <p>
            Independent of AG Grid.
            <br />
            No AG Grid runtime dependency.
          </p>
        </div>
      </footer>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </GridThemeProvider>
  );
}
