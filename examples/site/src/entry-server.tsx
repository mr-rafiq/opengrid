import { renderToString } from "react-dom/server";
import { App } from "./App";
export function renderPage(pathname: string) {
  return renderToString(<App initialPath={pathname} />);
}
