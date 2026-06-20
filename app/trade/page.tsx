import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  browseBinders,
  listMyTrades,
  listOwnInventory,
  resolveDisplayNames,
} from "@/lib/trade/queries";
import TradeCenterClient from "@/components/trade/TradeCenterClient";

export const dynamic = "force-dynamic";

export default async function TradeCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/trade");

  const [myTrades, browse, inventory] = await Promise.all([
    listMyTrades(user.id),
    browseBinders(user.id, 60),
    listOwnInventory(user.id),
  ]);

  const names = await resolveDisplayNames(browse.map((b) => b.owner_id));
  const ownerNames: Record<string, string | null> = {};
  for (const b of browse) ownerNames[b.owner_id] = names.get(b.owner_id) ?? null;

  return (
    <TradeCenterClient
      currentUserId={user.id}
      initialView={sp.view ?? "trades"}
      myTrades={myTrades}
      browse={browse}
      inventory={inventory}
      ownerNames={ownerNames}
    />
  );
}
