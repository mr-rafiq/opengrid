import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GridIcon } from "./icons.js";

export interface GridWorkspacePanel {
  id: string;
  label: string;
  icon?: Parameters<typeof GridIcon>[0]["name"];
  content: ReactNode;
}
export interface GridWorkspaceProps {
  children: ReactNode;
  panels: readonly GridWorkspacePanel[];
  initialPanel?: string;
  label?: string;
  openLabel?: string;
  closeLabel?: string;
  className?: string;
}
/** A host for real application panels. The selected panel mounts once, in a desktop rail or modal mobile drawer. */
export function GridWorkspace({
  children,
  panels,
  initialPanel,
  label = "Grid panels",
  openLabel = "Open grid panels",
  closeLabel = "Close grid panels",
  className = "",
}: GridWorkspaceProps) {
  if (
    panels.some((p) => !p.id || !p.label) ||
    new Set(panels.map((p) => p.id)).size !== panels.length
  )
    throw new TypeError(
      "Workspace panels require unique nonempty IDs and labels",
    );
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, select] = useState(initialPanel ?? panels[0]?.id);
  const [mobile, setMobile] = useState(false),
    [open, setOpen] = useState(false);
  const current = panels.find((p) => p.id === selected) ?? panels[0];
  useEffect(() => {
    const media = matchMedia("(max-width: 1024px)");
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (mobile && open && !node.open) node.showModal();
    else if (node.open) node.close();
  }, [mobile, open]);
  const panel = current && (
    <>
      <div
        className="og-workspace-tabs"
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
      >
        {panels.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel`}
            aria-selected={current.id === item.id}
            tabIndex={current.id === item.id ? 0 : -1}
            onClick={() => select(item.id)}
            onKeyDown={(event) => {
              let next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? panels.length - 1
                    : event.key === "ArrowDown"
                      ? (index + 1) % panels.length
                      : event.key === "ArrowUp"
                        ? (index + panels.length - 1) % panels.length
                        : undefined;
              if (next !== undefined) {
                event.preventDefault();
                select(panels[next].id);
                buttons.current[next]?.focus();
              }
            }}
          >
            {item.icon && <GridIcon name={item.icon} size={16} />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div
        key={current.id}
        className="og-workspace-panel"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${panels.indexOf(current)}`}
        tabIndex={0}
      >
        {current.content}
      </div>
    </>
  );
  return (
    <section className={`og-workspace ${className}`}>
      <div className="og-workspace-main">
        {panels.length > 0 && mobile && (
          <button
            className="og-workspace-launcher"
            ref={trigger}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <GridIcon name="columns" size={16} />
            {openLabel}
          </button>
        )}
        {children}
      </div>
      {panels.length > 0 &&
        (mobile ? (
          <dialog
            className="og-workspace-drawer"
            ref={dialog}
            aria-label={label}
            onCancel={() => setOpen(false)}
            onClose={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            <div className="og-workspace-drawer-heading">
              <strong>{label}</strong>
              <button
                type="button"
                aria-label={closeLabel}
                onClick={() => setOpen(false)}
              >
                <GridIcon name="close" size={18} />
              </button>
            </div>
            <div className="og-workspace-rail">{panel}</div>
          </dialog>
        ) : (
          <aside className="og-workspace-rail" aria-label={label}>
            {panel}
          </aside>
        ))}
    </section>
  );
}
