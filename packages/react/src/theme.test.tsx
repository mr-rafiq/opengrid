// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  act,
} from "@testing-library/react";
import { GridThemeSelect, setGridTheme } from "./theme.js";
let dark = false;
const changes = new Set<() => void>();
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.ogThemePreference;
  delete document.documentElement.dataset.ogTheme;
  dark = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return dark;
    },
    addEventListener: (_: string, cb: () => void) => changes.add(cb),
    removeEventListener: (_: string, cb: () => void) => changes.delete(cb),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("uses system appearance, persists explicit selection and ignores OS changes while explicit", () => {
  render(<GridThemeSelect />);
  expect(document.documentElement.dataset.ogTheme).toBe("light");
  act(() => {
    dark = true;
    changes.forEach((cb) => cb());
  });
  expect(document.documentElement.dataset.ogTheme).toBe("dark");
  fireEvent.change(screen.getByRole("combobox", { name: "Color theme" }), {
    target: { value: "light" },
  });
  expect(localStorage.getItem("opengrid-theme")).toBe("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
  act(() => changes.forEach((cb) => cb()));
  expect(document.documentElement.dataset.ogTheme).toBe("light");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "system" },
  });
  expect(document.documentElement.dataset.ogTheme).toBe("dark");
});
it("loads saved choices and synchronizes another tab's storage changes", () => {
  localStorage.setItem("opengrid-theme", "dark");
  render(<GridThemeSelect />);
  expect(document.documentElement.dataset.ogTheme).toBe("dark");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "opengrid-theme", newValue: "light" }),
    ),
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
    "light",
  );
  expect(document.documentElement.dataset.ogTheme).toBe("light");
});
it("continues working when browser storage is denied and rejects invalid preferences", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  render(<GridThemeSelect />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "dark" } });
  expect(document.documentElement.dataset.ogTheme).toBe("dark");
  expect(() => setGridTheme("wrong" as "dark")).toThrow(TypeError);
});
it("cleans up media listeners after the final subscriber unmounts", () => {
  const first = render(<GridThemeSelect />);
  const second = render(<GridThemeSelect />);
  expect(changes.size).toBe(1);
  first.unmount();
  expect(changes.size).toBe(1);
  second.unmount();
  expect(changes.size).toBe(0);
});
