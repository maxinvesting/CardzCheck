"use client";

import { useRouter } from "next/navigation";
import type { BusinessInventoryItem } from "@/types";
import { CardImage } from "@/components/CardImage";

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
  const router = useRouter();
  const badge = getGradeBadge(item);
  const mv = item.current_market_value_cents;
  const cost = item.cost_basis_total_cents;
  const profileHref = `/card/${item.id}?from=business`;
  const mvColor =
    mv == null ? "#1A1A1A" : mv > cost ? "#2D7A4F" : mv < cost ? "#CC4444" : "#1A1A1A";
  const days = getDaysHeld(item.acquisition_date);
  const action = getAction(item);
  const openProfile = () => router.push(profileHref);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProfile();
        }
      }}
      className="group bg-white border border-[#E8E5E0] rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-md shadow-sm"
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openProfile();
        }}
        aria-label={`Open card profile for ${item.title || "Untitled"}`}
        className="w-full p-0 border-0 bg-transparent cursor-pointer"
      >
        {/* TOP IMAGE SECTION */}
        <div className="relative h-22 shrink-0 overflow-hidden" style={{ height: 88 }}>
          <CardImage
            image={item.trusted_image}
            alt={item.title ?? "Card"}
            aspectClassName="h-full w-full"
            className="h-full rounded-none border-0 bg-[#F2EFE9]"
            imageClassName="object-contain"
            fallbackClassName="bg-[#F2EFE9]"
          />
          {badge && (
            <span
              className="absolute top-1.5 right-1.5 text-[9px] font-medium px-[5px] py-0.5 rounded whitespace-nowrap leading-[1.4]"
              style={{ background: badge.style.background, color: badge.style.color }}
            >
              {badge.label}
            </span>
          )}
        </div>
      </button>

      {/* BOTTOM INFO SECTION */}
      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5 flex-1">
        {/* Card name */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openProfile();
          }}
          className="text-left border-0 bg-transparent p-0 cursor-pointer"
        >
          <p className="text-[11px] font-semibold text-[#0B7A4B] leading-[1.4] m-0 line-clamp-2 group-hover:underline underline-offset-[2px]">
            {item.title || "Untitled"}
          </p>
        </button>

        {/* Price row */}
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-medium tabular-nums leading-none" style={{ color: mvColor }}>
            {mv != null ? fmtCents(mv) : "—"}
          </span>
          <span className="text-[10px] text-[#AAA]">
            cost {fmtCents(cost) || "—"}
          </span>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
            style={{ background: statusDotColor(item.status) }}
          />
          <span className="text-[10px] text-[#888] flex-1">
            {item.status}
          </span>
          {days != null && (
            <span className="text-[10px] text-[#BBB] tabular-nums">
              {days}d
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5 mt-0.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openProfile();
            }}
            className="text-[10px] font-semibold py-1 rounded bg-[#F0F8F4] text-[#0B7A4B] border border-[#C8E6D6] text-center cursor-pointer hover:bg-[#E0F2EA] transition-colors"
          >
            View card
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConsultant(action.prompt);
            }}
            className="w-full text-[10px] font-medium py-1 rounded text-center cursor-pointer transition-colors"
            style={{
              background: action.style.background,
              color: action.style.color,
              border: action.style.border,
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-[1.5px] border-dashed border-[#DDDDDD] rounded-xl min-h-[152px] flex flex-col items-center justify-center cursor-pointer bg-[#FAFAF8] hover:bg-[#F5F3F0] transition-colors gap-1"
    >
      <span className="text-2xl text-[#CCCCCC] leading-none">+</span>
      <span className="text-[11px] text-[#BBBBBB]">Add card</span>
    </button>
  );
}

export default function InventoryCardGrid({ items, onAddCard, onConsultant }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 px-4 sm:px-6 pb-6 pt-1">
      {items.map((item) => (
        <CardTile key={item.id} item={item} onConsultant={onConsultant} />
      ))}
      <AddTile onClick={onAddCard} />
    </div>
  );
}
