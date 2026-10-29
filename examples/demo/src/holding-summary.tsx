import { useState } from "react";

interface SummaryHolding {
  id: string;
  company: string;
  symbol: string;
  sector: string;
  region: string;
  shares: number;
}
export function HoldingSummary({ holding }: { holding: SummaryHolding }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      role="group"
      aria-label={`Summary for row ${holding.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        height: "100%",
        padding: "10px 18px",
        boxSizing: "border-box",
        background: "var(--og-surface, #eef5f3)",
        color: "var(--og-text, #203047)",
      }}
    >
      <span className="ticker">{holding.symbol}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{holding.company}</strong>
        <p style={{ margin: "3px 0 0", fontSize: 12 }}>
          {expanded
            ? `${holding.shares} shares in ${holding.region}; this custom full-width row keeps the original model identity.`
            : `${holding.sector} · ${holding.region}`}
        </p>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Toggle holding information
      </button>
    </div>
  );
}
