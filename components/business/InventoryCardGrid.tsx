"use client";

import Link from "next/link";
import { useState } from "react";
import type { BusinessInventoryItem } from "@/types";

interface Props {
  items: BusinessInventoryItem[];
  onAddCard: () => void;
  onConsultant: (prompt: string) => void;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return USD.format(cents / 100);
}

function getDaysHeld(acquisitionDate: string | null | undefined): number | null {
  if (!acquisitionDate) return null;
  const acq = new Date(acquisitionDate);
  if (isNaN(acq.getTime())) return null;
  return Math.floor((Date.now() - acq.getTime()) / 86_400_000);
}

type BadgeStyle = { background: string; color: string };

function getGradeBadge(item: BusinessInventoryItem): { label: string; style: BadgeStyle } | null {
  const company = item.grading_company?.toUpperCase();
  const grade = item.grade?.trim();

  if (item.condition_status === "raw" || (!company && !grade)) {
    const qty = item.quantity ?? 1;
    return {
      label: qty > 1 ? `Raw ×${qty}` : "Raw",
      style: { background: "#2A2A2A", color: "#AAAAAA" },
    };
  }
  if (company === "PSA") {
    return {
      label: `PSA ${grade ?? ""}`.trim(),
      style: { background: "#1B2B6B", color: "#BFD0FF" },
    };
  }
  if (company === "BGS") {
    return {
      label: `BGS ${grade ?? ""}`.trim(),
      style: { background: "#6B1B1B", color: "#FFD0D0" },
    };
  }
  // Any other grading company
  return {
    label: [company, grade].filter(Boolean).join(" ") || "Graded",
    style: { background: "#2A2A2A", color: "#AAAAAA" },
  };
}

type ActionDef = {
  label: string;
  style: { background: string; color: string; border: string };
  prompt: string;
};

function getAction(item: BusinessInventoryItem): ActionDef {
  const mv = item.current_market_value_cents;
  const cost = item.cost_basis_total_cents;
  const days = getDaysHeld(item.acquisition_date);
  const listPrice = item.list_price_cents;

  const isUnderwater = mv != null && mv < cost;
  const isUnlisted = item.status === "unlisted";
  const isListed = item.status === "listed";
  const listedTooLong = isListed && days != null && days > 21;
  const hasGoodMargin = mv != null && cost > 0 && mv > cost * 1.1;

  if (isUnderwater) {
    return {
      label: "Underwater ↗",
      style: { background: "#FEF0F0", color: "#CC4444", border: "1px solid #F0C0C0" },
      prompt: `${item.title} is underwater — cost ${fmtCents(cost)}, MV ${fmtCents(mv)}. Cut losses or hold?`,
    };
  }
  if (isUnlisted && hasGoodMargin) {
    return {
      label: "List now ↗",
      style: { background: "#F0F8F4", color: "#2D7A4F", border: "1px solid #C8E6D6" },
      prompt: `Should I list my ${item.title} now? Cost ${fmtCents(cost)}, est MV ${fmtCents(mv!)}.`,
    };
  }
  if (listedTooLong) {
    return {
      label: "Reprice ↗",
      style: { background: "#FBF5E8", color: "#8A5C0A", border: "1px solid #E8D5A0" },
      prompt: `My ${item.title} has been listed ${days}d at ${listPrice != null ? fmtCents(listPrice) : "unknown price"}. Should I reprice?`,
    };
  }
  return {
    label: "Analyze ↗",
    style: { background: "#F2EFE9", color: "#777777", border: "1px solid #E5E2DD" },
    prompt: `Analyze my ${item.title} — cost ${fmtCents(cost)}, MV ${mv != null ? fmtCents(mv) : "unknown"}.`,
  };
}

function statusDotColor(status: BusinessInventoryItem["status"]): string {
  switch (status) {
    case "listed": return "#2D7A4F";
    case "pending_sale": return "#C08A20";
    default: return "#BBBBBB";
  }
}

function CardTile({
  item,
  onConsultant,
}: {
  item: BusinessInventoryItem;
  onConsultant: (prompt: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const imageUrl =
    item.user_image_url ?? item.stock_image_url ?? item.ebay_image_url ?? null;
  const badge = getGradeBadge(item);
  const mv = item.current_market_value_cents;
  const cost = item.cost_basis_total_cents;
  const profileHref = `/card/${item.id}?from=business`;
  const mvColor =
    mv == null
      ? "#1A1A1A"
      : mv > cost
      ? "#2D7A4F"
      : mv < cost
      ? "#CC4444"
      : "#1A1A1A";
  const days = getDaysHeld(item.acquisition_date);
  const action = getAction(item);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E8E5E0",
        borderRadius: 10,
        overflow: "hidden",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 4px 16px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "transform 0.15s, box-shadow 0.15s",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Link
        href={profileHref}
        aria-label={`Open card profile for ${item.title || "Untitled"}`}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {/* TOP IMAGE SECTION */}
        <div
          style={{
            height: 88,
            position: "relative",
            background: "#F2EFE9",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 72,
                  background: "#E5E2DC",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 9, color: "#AAA" }}>No photo</span>
              </div>
            </div>
          )}
          {/* Grade badge */}
          {badge && (
            <span
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                fontSize: 9,
                fontWeight: 500,
                padding: "2px 5px",
                borderRadius: 4,
                background: badge.style.background,
                color: badge.style.color,
                whiteSpace: "nowrap",
                lineHeight: 1.4,
              }}
            >
              {badge.label}
            </span>
          )}
        </div>
      </Link>

      {/* BOTTOM INFO SECTION */}
      <div style={{ padding: "9px 10px 10px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
        {/* Card name */}
        <Link href={profileHref} style={{ textDecoration: "none" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#0B7A4B",
              lineHeight: 1.4,
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
              textDecoration: hovered ? "underline" : "none",
              textUnderlineOffset: 2,
            }}
          >
            {item.title || "Untitled"}
          </p>
        </Link>

        {/* Price row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: mvColor,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {mv != null ? fmtCents(mv) : "—"}
          </span>
          <span style={{ fontSize: 10, color: "#AAA" }}>
            cost {fmtCents(cost) || "—"}
          </span>
        </div>

        {/* Status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: statusDotColor(item.status),
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 10, color: "#888", flex: 1 }}>
            {item.status}
          </span>
          {days != null && (
            <span style={{ fontSize: 10, color: "#BBB", fontVariantNumeric: "tabular-nums" }}>
              {days}d
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 2 }}>
          <Link
            href={profileHref}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "5px 0",
              borderRadius: 5,
              background: "#F0F8F4",
              color: "#0B7A4B",
              border: "1px solid #C8E6D6",
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            View card
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConsultant(action.prompt);
            }}
            style={{
              width: "100%",
              fontSize: 10,
              fontWeight: 500,
              padding: "5px 0",
              borderRadius: 5,
              cursor: "pointer",
              background: action.style.background,
              color: action.style.color,
              border: action.style.border,
              textAlign: "center",
            }}
          >
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: "1.5px dashed #DDDDDD",
        borderRadius: 10,
        minHeight: 152,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: hovered ? "#F5F3F0" : "#FAFAF8",
        transition: "background 0.15s",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 24, color: "#CCCCCC", lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 11, color: "#BBBBBB" }}>Add card</span>
    </div>
  );
}

export default function InventoryCardGrid({ items, onAddCard, onConsultant }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
        gap: 10,
        padding: "0 24px 24px",
      }}
    >
      {items.map((item) => (
        <CardTile key={item.id} item={item} onConsultant={onConsultant} />
      ))}
      <AddTile onClick={onAddCard} />
    </div>
  );
}
