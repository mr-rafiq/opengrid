import type { SVGProps } from "react";

const paths = {
  search: "M20 20l-4.7-4.7M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  grid: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  columns: "M3 4h18v16H3zM9 4v16M15 4v16",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14",
  monitor: "M3 4h18v13H3zM8 21h8m-4-4v4",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  arrowUp: "M12 20V4m-6 6 6-6 6 6",
  arrowDown: "M12 4v16m-6-6 6 6 6-6",
  arrowLeft: "M20 12H4m6-6-6 6 6 6",
  arrowRight: "M4 12h16m-6-6 6 6-6 6",
  external: "M14 3h7v7m0-7L10 14M10 4H4v16h16v-6",
  sort: "m7 9 5-5 5 5M7 15l5 5 5-5",
  more: "M12 4v.01M12 12v.01M12 20v.01",
  undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12",
  redo: "m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12",
  download: "M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6",
  copy: "M9 9h12v12H9zM15 5V3H3v12h2",
  paste: "M9 3h6v4H9zM9 5H5v16h14V5h-4M9 12h6m-6 4h6",
  edit: "m14 5 5 5M4 20l4-1L21 6l-5-5L3 14l-1 8",
  note: "M4 3h16v13l-5 5H4zM15 21v-6h5M8 8h8m-8 4h5",
  filter: "M3 4h18l-7 8v7l-4 2v-9z",
  range: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7h10v10H7z",
  fill: "M4 3h16v18H4zM4 9h16M8 15l4 4 4-4m-4-4v8",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M10 15v6",
  book: "M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1m0-16c4-3 8-2 10-1v16c-4-2-7-1-10 1V5",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  chart: "M3 3v18h18M7 15l4-5 4 3 5-8",
  panel: "M3 4h18v16H3zM9 4v16m6-11-3 3 3 3",
  check: "m5 12 4 4L20 5",
  trendUp: "m3 17 6-6 4 4 8-11m-6 0h6v6",
  trendDown: "m3 7 6 6 4-4 8 11m-6 0h6v-6",
  grip: "M8 5v.01M16 5v.01M8 12v.01M16 12v.01M8 19v.01M16 19v.01",
} as const;
export type GridIconName = keyof typeof paths;
/** Original, decorative stroke icons. The containing control supplies its accessible name. */
export function GridIcon({
  name,
  size = 18,
  className = "",
  ...props
}: Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: GridIconName;
  size?: number;
}) {
  return (
    <svg
      {...props}
      className={`og-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
