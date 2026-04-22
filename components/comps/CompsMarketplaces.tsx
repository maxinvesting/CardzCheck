"use client";

import type { CollectionItem } from "@/types";
import {
  buildMarketplaceLinks,
  MARKETPLACE_TYPE_LABELS,
  type MarketplaceType,
} from "@/lib/comps/marketplace-urls";

interface Props {
  card: CollectionItem;
}

const TYPE_COLORS: Record<MarketplaceType, { bg: string; text: string }> = {
  sold: { bg: "#FEF2F2", text: "#DC2626" },
  active: { bg: "#F0FDF4", text: "#16A34A" },
  auction: { bg: "#FFF7ED", text: "#C2410C" },
  "price-guide": { bg: "#EFF6FF", text: "#1D4ED8" },
};

// External link arrow icon
function ArrowUpRight() {
  return (
    <svg
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      style={{ flexShrink: 0 }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

export default function CompsMarketplaces({ card }: Props) {
  const links = buildMarketplaceLinks({
    playerName: card.player_name,
    year: card.year,
    setName: card.set_name,
    grade: card.grade,
    gradingCompany: card.grading_company,
    parallelType: card.parallel_type,
    insert: card.insert,
  });

  const searchLabel = [card.year, card.player_name, card.grade]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          Searching for{" "}
          <span style={{ fontWeight: 600, color: "#0f172a" }}>
            &ldquo;{searchLabel}&rdquo;
          </span>{" "}
          across platforms. All links open the marketplace with your card
          pre-filled.
        </div>
      </div>

      {/* Platform grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        {links.map((link) => {
          const typeBadge = TYPE_COLORS[link.type];
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "12px 14px",
                background: "#fafafa",
                border: "0.5px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                textDecoration: "none",
                cursor: "pointer",
                transition: "background 100ms ease, border-color 100ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f1f5f9";
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.14)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fafafa";
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
              }}
            >
              {/* Top row: name + arrow */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#0f172a",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {link.name}
                </span>
                <span style={{ color: "#94a3b8" }}>
                  <ArrowUpRight />
                </span>
              </div>

              {/* Bottom row: tagline + type badge */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1 }}>
                  {link.tagline}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: typeBadge.bg,
                    color: typeBadge.text,
                  }}
                >
                  {MARKETPLACE_TYPE_LABELS[link.type]}
                </span>
              </div>
            </a>
          );
        })}
      </div>

      {/* Footer note */}
      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
        Live price data from eBay is shown in the Comps &amp; Market Value
        section below.
      </p>
    </div>
  );
}
