"use client";

import { useRouter } from "next/navigation";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Why the modal is showing. The copy adapts so the user immediately knows
   * which gate they hit and what tier unlocks it.
   */
  type:
    | "search"
    | "collection"
    | "analyst"
    | "bulk_cert"
    | "multi_card_scan"
    | "marketplace_sell";
}

interface CopyEntry {
  title: string;
  subtitle: string;
  recommendedTier: "business" | "business_pro";
}

const COPY: Record<PaywallModalProps["type"], CopyEntry> = {
  search: {
    title: "Unlock unlimited searches",
    subtitle: "You've reached the search limit on the Free tier.",
    recommendedTier: "business",
  },
  collection: {
    title: "Expand your inventory",
    subtitle:
      "Free accounts are capped at 10 cards. Upgrade to add the rest of your inventory.",
    recommendedTier: "business",
  },
  analyst: {
    title: "Unlock the CardzCheck Analyst",
    subtitle:
      "Free accounts don't include AI analyst messages. Business gets 3 per week, Business Pro is unlimited.",
    recommendedTier: "business_pro",
  },
  bulk_cert: {
    title: "Bulk PSA cert import is a Pro feature",
    subtitle: "Paste hundreds of cert numbers at once with Business Pro.",
    recommendedTier: "business_pro",
  },
  multi_card_scan: {
    title: "Multi-card grading is a Pro feature",
    subtitle:
      "Scan up to 10 cards in a single grading session on Business Pro.",
    recommendedTier: "business_pro",
  },
  marketplace_sell: {
    title: "Lower marketplace fees with a subscription",
    subtitle:
      "Free sellers pay 8–15% in platform fees. Business cuts that in half; Business Pro is just 1–5%.",
    recommendedTier: "business_pro",
  },
};

const TIER_LABEL = {
  business: "CardzCheck Business",
  business_pro: "CardzCheck Business Pro",
};

export default function PaywallModal({ isOpen, onClose, type }: PaywallModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const copy = COPY[type];

  const handleContact = () => {
    // Stripe products / pricing pages are still in flight. Until they ship,
    // route interested users to the contact form so we can hand-hold them
    // through the upgrade.
    router.push("/contact?intent=upgrade");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[#24282D] bg-[#0F1317] text-[#E6E8EB] shadow-2xl">
        {/* Header */}
        <div className="border-b border-[#24282D] bg-[#0B0D0F] px-6 py-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
            Upgrade required
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[#E6E8EB]">
            {copy.title}
          </h2>
          <p className="mt-1 text-[12px] text-[#B8C0CC]">{copy.subtitle}</p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-2 gap-3 p-5">
          <PlanCard
            name="Business"
            recommended={copy.recommendedTier === "business"}
            bullets={[
              "Unlimited inventory items",
              "3 analyst messages / week",
              "Single-card grading scans",
              "Marketplace fees: 4 / 5 / 8%",
            ]}
            cta="Coming soon"
          />
          <PlanCard
            name="Business Pro"
            recommended={copy.recommendedTier === "business_pro"}
            bullets={[
              "Everything in Business",
              "Unlimited analyst messages",
              "Bulk PSA cert import",
              "Multi-card grading scans",
              "Marketplace fees: 1 / 2 / 5%",
            ]}
            cta="Coming soon"
          />
        </div>

        {/* Footer */}
        <div className="border-t border-[#24282D] bg-[#0B0D0F] px-6 py-4">
          <p className="text-[11px] text-[#77808C]">
            Stripe checkout is being finalized. In the meantime, reach out and
            we'll set you up manually.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleContact}
              className="flex-1 border border-[#20B26B] bg-[#20B26B] px-3 py-2 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C]"
            >
              Contact us about {TIER_LABEL[copy.recommendedTier]}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-[#343941] px-3 py-2 text-[12px] font-medium text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  bullets,
  cta,
  recommended,
}: {
  name: string;
  bullets: string[];
  cta: string;
  recommended: boolean;
}) {
  return (
    <div
      className={`flex flex-col border p-3 text-[12px] ${
        recommended
          ? "border-[#20B26B] bg-[#0B1A12]"
          : "border-[#24282D] bg-[#0B0D0F]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-[#E6E8EB]">{name}</div>
        {recommended ? (
          <span className="border border-[#20B26B] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#20B26B]">
            Recommended
          </span>
        ) : null}
      </div>
      <ul className="mt-2 flex-1 space-y-1 text-[#B8C0CC]">
        {bullets.map((b) => (
          <li key={b} className="leading-snug">
            · {b}
          </li>
        ))}
      </ul>
      <div className="mt-3 border border-[#343941] px-2 py-1 text-center text-[10px] uppercase tracking-wide text-[#77808C]">
        {cta}
      </div>
    </div>
  );
}
