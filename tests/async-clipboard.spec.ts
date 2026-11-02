import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const reads: Array<(value: string) => void> = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: () => new Promise<string>((resolve) => reads.push(resolve)),
      },
    });
    Object.assign(window, {
      resolveGridClipboard: (index: number, value: string) =>
        reads[index](value),
    });
  });
  await page.goto(process.env.GRID_BASE_PATH ?? "/");
  await page.getByText("View options", { exact: true }).click();
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  const cell = (id: string) =>
    grid.locator(`[data-row-id="${id}"][data-column-id="price"]`);
  const paste = page.getByRole("button", { name: "Paste cells", exact: true });
  const resolve = async (index: number, value: string) => {
    await page.evaluate(
      ({ index, value }) => {
        (
          window as unknown as {
            resolveGridClipboard: (index: number, value: string) => void;
          }
        ).resolveGridClipboard(index, value);
      },
      { index, value },
    );
  };
  return { cell, paste, resolve, errors };
}

test("delayed toolbar paste cannot retarget another cell and a fresh request keeps one undo", async ({
  page,
}) => {
  const { cell, paste, resolve, errors } = await setup(page);
  await cell("1").click();
  await paste.click();
  await cell("2").click();
  await resolve(0, "999");
  await expect(cell("1")).toContainText("$42.00");
  await expect(cell("2")).toContainText("$59.13");
  await paste.click();
  await resolve(1, "145.6");
  await expect(cell("2")).toContainText("$145.60");
  await cell("2").press("Control+z");
  await expect(cell("2")).toContainText("$59.13");
  expect(errors).toEqual([]);
});

test("a sort cancels pending clipboard intent before a new view can be edited", async ({
  page,
}) => {
  const { cell, paste, resolve, errors } = await setup(page);
  await cell("1").click();
  await paste.click();
  await page.getByRole("button", { name: "Sort Price", exact: true }).click();
  await resolve(0, "999");
  await expect(cell("1")).toContainText("$42.00");
  expect(errors).toEqual([]);
});

test("newest request wins even when the earlier clipboard read resolves first", async ({
  page,
}) => {
  const { cell, paste, resolve, errors } = await setup(page);
  await cell("1").click();
  await paste.click();
  await paste.click();
  await resolve(0, "999");
  await expect(cell("1")).toContainText("$42.00");
  await resolve(1, "87.5");
  await expect(cell("1")).toContainText("$87.50");
  await cell("1").press("Control+z");
  await expect(cell("1")).toContainText("$42.00");
  expect(errors).toEqual([]);
});

test("opening an editor cancels pending paste without losing its draft", async ({
  page,
}) => {
  const { cell, paste, resolve, errors } = await setup(page);
  await cell("1").click();
  await paste.click();
  await cell("1").press("F2");
  const editor = page.getByRole("spinbutton", {
    name: "Edit Price row 1",
    exact: true,
  });
  await editor.fill("123.45");
  await resolve(0, "999");
  await expect(editor).toHaveValue("123.45");
  await editor.press("Escape");
  await expect(cell("1")).toContainText("$42.00");
  await cell("1").press("F2");
  await editor.fill("123.45");
  await editor.press("Enter");
  await expect(cell("1")).toContainText("$123.45");
  await cell("1").press("Control+z");
  await expect(cell("1")).toContainText("$42.00");
  expect(errors).toEqual([]);
});
