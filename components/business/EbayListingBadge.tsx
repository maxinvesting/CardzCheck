"use client";

interface Props {
  ebayItemId: string | null | undefined;
  status?: "active" | "ended" | "sold" | "error" | null;
  listingUrl?: string | null;
  size?: "sm" | "xs";
}

const STATUS_STYLES = {
  active: "bg-[#86b817]/15 text-[#86b817] border-[#86b817]/30",
  sold: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ended: "bg-white/5 text-white/30 border-white/10",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

const STATUS_LABELS = {
  active: "Live",
  sold: "Sold",
  ended: "Ended",
  error: "Error",
};

export default function EbayListingBadge({ ebayItemId, status, listingUrl, size = "xs" }: Props) {
  if (!ebayItemId) return null;

  const resolvedStatus = status ?? "active";
  const styles = STATUS_STYLES[resolvedStatus] ?? STATUS_STYLES.ended;
  const label = STATUS_LABELS[resolvedStatus] ?? resolvedStatus;
  const textSize = size === "sm" ? "text-xs" : "text-[10px]";

  const badge = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-semibold leading-none ${textSize} ${styles}`}
    >
      {/* eBay mini brand mark */}
      <span className="font-extrabold tracking-tighter text-[9px]">
        <span style={{ color: "#e43137" }}>e</span>
        <span style={{ color: "#0064d3" }}>B</span>
        <span style={{ color: "#f5af02" }}>a</span>
        <span style={{ color: "#86b817" }}>y</span>
      </span>
      {label}
    </span>
  );

  if (listingUrl && resolvedStatus === "active") {
    return (
      <a
        href={listingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-80 transition"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </a>
    );
  }

  return badge;
}
