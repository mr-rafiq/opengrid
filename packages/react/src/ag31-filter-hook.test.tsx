// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { Ag31ReactiveFilterBody, useGridFilter } from "./ag31-filter-hook.js";
import { createAg31ReactiveFilter } from "./ag31-reactive-filter.js";
afterEach(cleanup);
it("acknowledges initialization effects before an API restore replaces their model", async () => {
  const filter = createAg31ReactiveFilter<{ data: { id: string } }>(() => {});
  function Source({ model, onModelChange }: any) {
    const [selection, setSelection] = useState<string[]>([]);
    useEffect(() => {
      setSelection(["a", "b"]);
      void onModelChange({ values: ["a", "b"] });
    }, []);
    useGridFilter<{ id: string }>({
      doesFilterPass: (p) => selection.includes(p.data?.id ?? ""),
    });
    return <output>{JSON.stringify(model)}</output>;
  }
  const restored = filter
    .whenReady()
    .then((ready) => ready && filter.stage({ values: ["a"] }));
  render(
    <Ag31ReactiveFilterBody filter={filter} component={Source} params={{}} />,
  );
  await act(async () => {
    await restored;
  });
  expect(filter.getModel()).toEqual({ values: ["a"] });
  expect(screen.getByRole("status").textContent).toBe('{"values":["a"]}');
  // Restoring a model cannot repair this source component's unsynchronized local state.
  expect(filter.doesFilterPass({ data: { id: "b" } })).toBe(true);
  filter.destroy();
});
it("commits wrapper-controlled models after source hooks update and retains local state", async () => {
  const changed = vi.fn(),
    filter = createAg31ReactiveFilter<{ data: { id: string } }>(changed),
    mount = vi.fn();
  function Source({ model, onModelChange }: any) {
    const [value, setValue] = useState("a");
    useState(() => mount());
    useGridFilter<{ id: string }>({
      doesFilterPass: (p) => p.data?.id === value,
    });
    return (
      <>
        <output aria-label="model">{JSON.stringify(model)}</output>
        <button
          onClick={() => {
            setValue("b");
            onModelChange({ values: ["b"] });
          }}
        >
          Select B
        </button>
      </>
    );
  }
  const params = Object.freeze({});
  const view = render(
    <Ag31ReactiveFilterBody
      filter={filter}
      component={Source}
      params={params}
    />,
  );
  expect(await filter.whenReady()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Select B" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(filter.getModel()).toEqual({ values: ["b"] });
  expect(filter.doesFilterPass({ data: { id: "b" } })).toBe(true);
  let pending: Promise<boolean> | undefined;
  await act(async () => {
    pending = filter.stage({ values: ["a"] });
  });
  expect(await pending).toBe(true);
  expect(screen.getByLabelText("model").textContent).toBe('{"values":["a"]}');
  // The unchanged source component owns local selection; restoring a wrapper model cannot invent its synchronization.
  expect(filter.doesFilterPass({ data: { id: "b" } })).toBe(true);
  expect(mount).toHaveBeenCalledTimes(1);
  view.unmount();
  filter.destroy();
});
