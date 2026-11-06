import { useMemo, useRef, useState } from "react";
import {
  Ag31ClientGrid,
  useGridFilter,
  type Ag31ClientGridHandle,
  type Ag31ColumnDefinition,
  type Ag31SourceFilterModel,
} from "@opengrid/react";
const teams = ["Design", "Operations"] as const;
class Line {
  constructor(
    public id: string,
    public label: string,
    public team: (typeof teams)[number],
  ) {}
  caption() {
    return this.label;
  }
}
type TeamModel = { teams: string[] };
function TeamFilter({
  model,
  onModelChange,
}: {
  model: TeamModel | null;
  onModelChange(model: TeamModel | null): void;
}) {
  const [search, setSearch] = useState(""),
    selected = new Set(model?.teams ?? teams);
  useGridFilter<Line>({
    doesFilterPass: ({ data }) => !!data && selected.has(data.team),
  });
  return (
    <div className="source-custom-filter-surface">
      <label>
        Find a team
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <fieldset>
        <legend>Included teams</legend>
        {teams
          .filter((team) => team.toLowerCase().includes(search.toLowerCase()))
          .map((team) => (
            <label key={team}>
              <input
                type="checkbox"
                checked={selected.has(team)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(team);
                  else next.delete(team);
                  onModelChange(
                    next.size === teams.length ? null : { teams: [...next] },
                  );
                }}
              />
              {team}
            </label>
          ))}
      </fieldset>
      <button type="button" onClick={() => onModelChange(null)}>
        Include all teams
      </button>
    </div>
  );
}
const columns: Ag31ColumnDefinition<Line>[] = [
  { field: "label", headerName: "Line", width: 170, filter: false },
  { field: "team", headerName: "Team", width: 150, filter: TeamFilter },
];
const getRowId = ({ data }: { data: Line }) => data.id;
export function SourceCustomFilterLab() {
  const rows = useMemo(
      () => [
        new Line("a", "Line Alpha", "Design"),
        new Line("b", "Line Beta", "Operations"),
        new Line("c", "Line Gamma", "Design"),
      ],
      [],
    ),
    grid = useRef<Ag31ClientGridHandle<Line>>(null);
  const [saved, setSaved] = useState<Ag31SourceFilterModel | null>(null),
    [ready, setReady] = useState(false),
    [summary, setSummary] = useState("Waiting for grid"),
    [notice, setNotice] = useState(
      "Open the Team column menu, then choose Focus column filter.",
    );
  const update = () => {
    const api = grid.current?.api;
    if (!api || api.isDestroyed()) return;
    let original = true;
    api.forEachLeafNode((node) => {
      original &&= node.data === rows.find((row) => row.id === node.id);
    });
    setSummary(
      `${api.getDisplayedRowCount()} displayed lines | original objects: ${original ? "yes" : "no"}`,
    );
  };
  return (
    <article
      aria-label="Reactive custom source filters"
      className="source-custom-filter-lab"
    >
      <h3>Reactive custom filters</h3>
      <p>
        An original controlled filter uses its own model shape. Closing the
        popup retains its search. Saving and restoring the wrapper model updates
        this component's checkbox state.
      </p>
      <div className="grouping-lab-controls">
        <button
          type="button"
          disabled={!ready}
          onClick={() => grid.current?.api.showColumnFilter("team")}
        >
          Open Team filter
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            setSaved(grid.current?.api.getFilterModel() ?? {});
            setNotice("Custom filter saved for this example");
          }}
        >
          Save custom filter
        </button>
        <button
          type="button"
          disabled={!saved || !ready}
          onClick={async () => {
            await grid.current?.api.setFilterModel(saved);
            setNotice("Saved custom filter restored");
          }}
        >
          Restore custom filter
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={async () => {
            await grid.current?.api.setFilterModel(null);
            setNotice("Custom filter cleared");
          }}
        >
          Clear custom filter
        </button>
      </div>
      <p role="status" aria-label="Custom filter summary">
        {summary}
      </p>
      <p role="status" aria-label="Custom filter notice">
        {notice}
      </p>
      <Ag31ClientGrid
        ref={grid}
        rowData={rows}
        columnDefs={columns}
        getRowId={getRowId}
        height={260}
        ariaLabel="Custom source teams"
        onGridReady={() => {
          setReady(true);
          update();
        }}
        onModelUpdated={update}
      />
    </article>
  );
}
