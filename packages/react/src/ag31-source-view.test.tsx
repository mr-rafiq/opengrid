// @vitest-environment jsdom
import React, { createRef } from "react";
import { render, cleanup, act, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  Ag31ClientGrid,
  type Ag31ClientGridHandle,
} from "./ag31-client-grid.js";
afterEach(cleanup);
it("attaches the real committed viewport before ready and revokes it on explicit destruction", async () => {
  const ref = createRef<Ag31ClientGridHandle<{ id: string }>>(),
    ready = vi.fn();
  render(
    <Ag31ClientGrid
      ref={ref}
      rowData={[{ id: "a" }]}
      columnDefs={[{ field: "id" }]}
      getRowId={({ data }) => data.id}
      onGridReady={(event) => ready(event.api.ctrlsService.params)}
      height={200}
    />,
  );
  await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  const service = ref.current!.api.ctrlsService;
  expect(ready.mock.calls[0][0]).toBe(service.params);
  expect(service.params).toBeTruthy();
  act(() => ref.current!.api.destroy());
  expect(service.params).toBeUndefined();
});
