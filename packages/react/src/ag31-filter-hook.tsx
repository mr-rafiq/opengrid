import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import {
  createAg31ReactiveFilter,
  type Ag31ReactiveFilterCallbacks,
} from "./ag31-reactive-filter.js";
import type { Ag31CustomFilterPassParams } from "./ag31-custom-filters.js";

type Filter = ReturnType<typeof createAg31ReactiveFilter<any>>;
const FilterContext = createContext<Filter | null>(null);

/** Experimental source hook. Only an owned retained filter body can register
 * callbacks; the nullable opaque model is controlled by the wrapper. */
export function useGridFilter<TData = unknown>(
  callbacks: Ag31ReactiveFilterCallbacks<Ag31CustomFilterPassParams<TData>>,
): void {
  const filter = useContext(FilterContext);
  if (!filter)
    throw new Error("useGridFilter requires an owned reactive source filter");
  useEffect(() => filter.register(callbacks));
}

export function Ag31ReactiveFilterBody({
  filter,
  component: Component,
  params,
}: {
  filter: Filter;
  component: ComponentType<any>;
  params: Readonly<Record<string, unknown>>;
}) {
  const snapshot = useSyncExternalStore(
    filter.subscribe,
    filter.getSnapshot,
    filter.getSnapshot,
  );
  useEffect(
    () => filter.commit(snapshot.revision),
    [filter, snapshot.revision],
  );
  return (
    <FilterContext.Provider value={filter}>
      <Component
        {...params}
        model={snapshot.model}
        onModelChange={filter.changeModel}
      />
    </FilterContext.Provider>
  );
}
