import { useSyncExternalStore, type ReactNode } from "react";
import { GridIcon } from "./icons.js";
import { useGridLocale } from "./locale.js";

export type GridThemePreference = "system" | "light" | "dark";
export type GridResolvedTheme = "light" | "dark";
export const GRID_THEME_STORAGE_KEY = "opengrid-theme";
interface ThemeSnapshot {
  readonly preference: GridThemePreference;
  readonly resolved: GridResolvedTheme;
}
const server: ThemeSnapshot = Object.freeze({
  preference: "system",
  resolved: "light",
});
let snapshot = server;
let preference: GridThemePreference | undefined;
let media: MediaQueryList | undefined;
const listeners = new Set<() => void>();
const valid = (value: unknown): value is GridThemePreference =>
  value === "system" || value === "light" || value === "dark";
function stored(): GridThemePreference | undefined {
  try {
    const value = window.localStorage.getItem(GRID_THEME_STORAGE_KEY);
    return valid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
function read(): ThemeSnapshot {
  if (typeof window === "undefined") return server;
  if (preference === undefined || listeners.size === 0) {
    const initial = document.documentElement.dataset.ogThemePreference;
    preference = stored() ?? (valid(initial) ? initial : "system");
  }
  const dark =
    media?.matches ??
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ??
    false;
  const resolved =
    preference === "system" ? (dark ? "dark" : "light") : preference;
  if (snapshot.preference !== preference || snapshot.resolved !== resolved)
    snapshot = Object.freeze({ preference, resolved });
  return snapshot;
}
function apply() {
  const next = read();
  const root = document.documentElement;
  root.dataset.ogThemePreference = next.preference;
  root.dataset.ogTheme = next.resolved;
  root.style.colorScheme = next.resolved;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", next.resolved === "dark" ? "#10141b" : "#f7f8fa");
}
function publish() {
  apply();
  for (const listener of [...listeners]) listener();
}
function systemChanged() {
  if (preference === "system") publish();
}
function storageChanged(event: StorageEvent) {
  if (event.key !== null && event.key !== GRID_THEME_STORAGE_KEY) return;
  preference = valid(event.newValue) ? event.newValue : "system";
  publish();
}
function subscribe(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    media = window.matchMedia?.("(prefers-color-scheme: dark)");
    preference =
      stored() ??
      (valid(document.documentElement.dataset.ogThemePreference)
        ? document.documentElement.dataset.ogThemePreference
        : "system");
    apply();
    media?.addEventListener("change", systemChanged);
    window.addEventListener("storage", storageChanged);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      media?.removeEventListener("change", systemChanged);
      media = undefined;
      window.removeEventListener("storage", storageChanged);
    }
  };
}
export function setGridTheme(next: GridThemePreference) {
  if (!valid(next)) throw new TypeError("Theme must be system, light or dark");
  if (typeof window === "undefined") return;
  preference = next;
  try {
    window.localStorage.setItem(GRID_THEME_STORAGE_KEY, next);
  } catch {
    /* The current document still follows the explicit choice. */
  }
  // Write the document before notifying React so menus and native controls update together.
  document.documentElement.dataset.ogThemePreference = next;
  publish();
}
export function useGridTheme() {
  const current = useSyncExternalStore(subscribe, read, () => server);
  return { ...current, setTheme: setGridTheme };
}
export function GridThemeProvider({ children }: { children: ReactNode }) {
  useGridTheme();
  return <>{children}</>;
}
export function GridThemeSelect({ className = "" }: { className?: string }) {
  const { preference, resolved, setTheme } = useGridTheme();
  const { t } = useGridLocale();
  return (
    <label className={`og-theme-select ${className}`}>
      <GridIcon
        name={
          preference === "system"
            ? "monitor"
            : resolved === "dark"
              ? "moon"
              : "sun"
        }
        size={16}
      />
      <span className="og-visually-hidden">{t("theme.label")}</span>
      <select
        aria-label={t("theme.label")}
        value={preference}
        onChange={(event) =>
          setTheme(event.target.value as GridThemePreference)
        }
      >
        <option value="system">{t("theme.system")}</option>
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
      </select>
    </label>
  );
}
