import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SellerOrdersClient from "./SellerOrdersClient";

export const dynamic = "force-dynamic";

export default async function SellerOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace/sell/orders");

  return <SellerOrdersClient />;
}
