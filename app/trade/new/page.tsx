import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getBinder,
  getTradeableCards,
  resolveDisplayNames,
} from "@/lib/trade/queries";
import NewTradeClient from "@/components/trade/NewTradeClient";

export const dynamic = "force-dynamic";

export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; want?: string }>;
}) {
  const sp = await searchParams;
  const partnerId = sp.partner ?? null;
  const wantId = sp.want ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/trade/new");

  if (!partnerId || partnerId === user.id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-2 text-[20px] font-semibold text-[color:var(--biz-text-strong)]">
          Start a trade
        </h1>
        <p className="mb-6 text-[13px] text-[color:var(--biz-muted)]">
          Browse other traders’ binders and pick a card you want — that’s how you
          kick off a trade.
        </p>
        <Link
          href="/trade?view=browse"
          className="inline-flex h-10 items-center border border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary)] px-5 text-[13px] font-semibold text-[color:var(--biz-primary-foreground)] hover:bg-[color:var(--biz-primary-hover)]"
        >
          Browse trade binders
        </Link>
      </div>
    );
  }

  const [myCards, partnerCards, names] = await Promise.all([
    getTradeableCards(user.id),
    getBinder(partnerId),
    resolveDisplayNames([partnerId]),
  ]);
  const partnerName = names.get(partnerId) ?? "this trader";

  return (
    <NewTradeClient
      partnerId={partnerId}
      partnerName={partnerName}
      myCards={myCards}
      partnerCards={partnerCards}
      seedWantId={wantId}
    />
  );
}
