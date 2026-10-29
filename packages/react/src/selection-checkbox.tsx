import { useLayoutEffect, useRef } from "react";

/** Native mixed state is a DOM property, not the checked attribute. */
export function SelectionCheckbox({
  label,
  checked,
  mixed = false,
  disabled = false,
  tabIndex,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  tabIndex?: number;
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Native clicks clear indeterminate before onChange. A rejected action can
  // re-render with unchanged props, so synchronize this DOM property each time.
  useLayoutEffect(() => {
    if (input.current && input.current.indeterminate !== mixed)
      input.current.indeterminate = mixed;
  });
  return (
    <input
      ref={input}
      type="checkbox"
      aria-label={label}
      aria-checked={mixed ? "mixed" : checked}
      checked={checked}
      disabled={disabled}
      tabIndex={tabIndex}
      onChange={onChange}
    />
  );
}
