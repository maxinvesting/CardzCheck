"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import TradeBuilder, { type TradeBuilderPayload } from "./TradeBuilder";
import type { TradeableCard } from "@/lib/trade/types";

export default function NewTradeClient({
  partnerId,
  partnerName,
  myCards,
  partnerCards,
  seedWantId,
  isSubscriber,
}: {
  partnerId: string;
  partnerName: string;
  myCards: TradeableCard[];
  partnerCards: TradeableCard[];
  seedWantId: string | null;
  isSubscriber: boolean;
}) {
  const router = useRouter();

  async function submit(payload: TradeBuilderPayload) {
    const res = await fetch("/api/trade/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: partnerId, ...payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || json.error || "Failed to create trade.");
    }
    router.push(`/trade/${json.trade_id}`);
  }

  const seedTheirIds =
    seedWantId && partnerCards.some((c) => c.id === seedWantId) ? [seedWantId] : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/trade?view=browse"
        className="mb-4 inline-flex items-center gap-1 text-[12px] text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Trade Center
      </Link>
      <h1 className="mb-1 text-[20px] font-semibold text-[color:var(--biz-text-strong)]">
        Propose a trade to {partnerName}
      </h1>
      <p className="mb-5 text-[13px] text-[color:var(--biz-muted)]">
        Pick what you’ll give and what you want in return. Add cash on top to even
        things out. {partnerName} can accept, decline, or counter.
      </p>

      <TradeBuilder
        mySide="initiator"
        myCards={myCards}
        theirCards={partnerCards}
        partnerName={partnerName}
        isSubscriber={isSubscriber}
        initialTheirIds={seedTheirIds}
        submitLabel="Send trade offer"
        onSubmit={submit}
      />
    </div>
  );
}
