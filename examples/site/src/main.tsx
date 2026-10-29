import { hydrateRoot, createRoot } from "react-dom/client";
import { App } from "./App";
import "@opengrid/react/styles.css";
import "./site.css";
const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
