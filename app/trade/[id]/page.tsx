import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTrade } from "@/lib/trade/queries";
import TradeDetailClient from "@/components/trade/TradeDetailClient";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cash?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/trade/${id}`);

  const trade = await getTrade(id, user.id);
  if (!trade) notFound();

  const cashFlash =
    sp.cash === "success" ? "success" : sp.cash === "canceled" ? "canceled" : null;

  return (
    <TradeDetailClient trade={trade} currentUserId={user.id} cashFlash={cashFlash} />
  );
}
