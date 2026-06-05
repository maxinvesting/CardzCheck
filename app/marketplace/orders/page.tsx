import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BuyerOrdersClient from "./BuyerOrdersClient";

export const dynamic = "force-dynamic";

export default async function BuyerOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace/orders");

  return <BuyerOrdersClient />;
}
